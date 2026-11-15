/**
 * Finding the game's clock from the Lua function that returns it. The engine registers
 * `Infinity_GetGameTicks` as a C closure: `adrp x1`/`add x1` of the closure, `lua_pushcclosure`,
 * then `adrp x1` of the name and `lua_setglobal`. The closure reads a 32-bit field through a chain
 * of pointer loads from a global, multiplies it by another global and shifts it left. gameClock
 * decodes that chain, so a rebuilt game gives its own offsets rather than the ones written here.
 */
import {
  addImmediate,
  adrp,
  type Code,
  loadImmediate,
  multiply,
  referencesTo,
  resolvedReferences,
  shiftLeft,
} from "./arm64.ts";

/** What the clock closure computes: `chain` read from `root`, times `multiplier`, shifted left. */
export type GameClock = {
  registration: number; // the adrp that loads the function's name
  closure: number; // the C function registered under it
  root: number; // the global the pointer chain starts from
  chain: number[]; // each load's offset in turn; all but the last read a pointer
  width: number; // bytes read by the last load: the clock field
  multiplier: number; // the global the field is multiplied by
  shift: number; // the left shift applied to the product
};

const wordsOf = (code: Code, from: number, count: number): number[] => {
  const view = new DataView(code.bytes.buffer, code.bytes.byteOffset, code.bytes.byteLength);
  const start = from - code.addr;
  return Array.from(
    { length: count },
    (_, k) => start + 4 * k + 4 <= code.bytes.length ? view.getUint32(start + 4 * k, true) : 0,
  );
};

const slice = (code: Code, from: number, bytes: number): Code => ({
  bytes: code.bytes.subarray(from - code.addr, from - code.addr + bytes),
  addr: from,
});

/**
 * The clock behind the function registered under the string at `name`, or undefined when the
 * registration or the closure has another shape. The closure is the last address resolved in the
 * 8 instructions before the name's adrp; its first `window` instructions are decoded.
 */
export function gameClock(code: Code, name: number, window = 16): GameClock | undefined {
  const registration = referencesTo(code, name)[0];
  if (registration === undefined) return undefined;
  const closure = resolvedReferences(slice(code, registration - 32, 32)).at(-1)?.target;
  if (closure === undefined || closure < code.addr || closure >= code.addr + code.bytes.length) {
    return undefined;
  }
  const words = wordsOf(code, closure, window);
  const globals = resolvedReferences(slice(code, closure, 4 * window));
  if (globals.length < 2) return undefined;
  const [root, multiplier] = globals.map((g) => g.target);
  // The register the root's address lands in: the add after its adrp.
  const page = (globals[0].at - closure) / 4;
  const rootReg = adrp(words[page], globals[0].at)!.rd;
  const add = words.slice(page + 1).map(addImmediate).find((a) => a?.rn === rootReg);
  if (!add) return undefined;
  let reg = add.rd, width = 0, at = page + 1;
  const chain: number[] = [];
  for (; at < words.length && width !== 4; at++) {
    const load = loadImmediate(words[at]);
    if (!load || load.rn !== reg) continue;
    chain.push(load.offset);
    reg = load.rt;
    width = load.size;
  }
  const mul = words.slice(at).map(multiply).find((m) => m?.rn === reg || m?.rm === reg);
  const lsl = mul && words.slice(at).map(shiftLeft).find((s) => s?.rn === mul.rd);
  if (width !== 4 || !lsl) return undefined;
  return { registration, closure, root, chain, width, multiplier, shift: lsl.shift };
}
