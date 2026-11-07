import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  addImmediate,
  adr,
  adrp,
  bl,
  cmpImmediate,
  decodeStatGetter,
  loadImmediate,
  referencesTo,
  resolvedReferences,
} from "../../src/re/arm64.ts";
import { parseBuilds } from "../../src/re/builds.ts";
import { archSlice, functionStarts, section } from "../../src/re/macho.ts";
import { GAME_BINARY } from "../../src/shared/config.ts";
import { encode, words } from "./macho_fixture.ts";

// Instruction words copied from the 2.7.3 arm64 slice, with the address each was found at.
const GAME = {
  adrpX21: { pc: 0x100335450, word: 0xd0019515 }, // adrp x21, 0x1035d7000
  addX21: 0x9111e2b5, // add x21, x21, #0x478
  ldrX0X21: 0xf94002a0, // ldr x0, [x21]
  bl: { pc: 0x100335468, word: 0x9408582e }, // bl 0x10054b520 (lua_pushcclosure)
  adr: { pc: 0x10007cd64, word: 0x1000008a }, // adr x10, 0x10007cd74
  cmp: 0x7103251f, // cmp w8, #0xc9
  ldrsh: 0x79c00800, // ldrsh w0, [x0, #0x4]
  ret: 0xd65f03c0,
};

Deno.test("each decoder reads its form from real game words", () => {
  deepStrictEqual(adrp(GAME.adrpX21.word, GAME.adrpX21.pc), { rd: 21, page: 0x1035d7000 });
  deepStrictEqual(addImmediate(GAME.addX21), { rd: 21, rn: 21, imm: 0x478 });
  deepStrictEqual(loadImmediate(GAME.ldrX0X21), {
    rt: 0,
    rn: 21,
    offset: 0,
    size: 8,
    signed: false,
    name: "ldr",
  });
  strictEqual(bl(GAME.bl.word, GAME.bl.pc), 0x10054b520);
  deepStrictEqual(adr(GAME.adr.word, GAME.adr.pc), { rd: 10, target: 0x10007cd74 });
  deepStrictEqual(cmpImmediate(GAME.cmp), { rn: 8, imm: 0xc9 });
  deepStrictEqual(loadImmediate(GAME.ldrsh), {
    rt: 0,
    rn: 0,
    offset: 4,
    size: 2,
    signed: true,
    name: "ldrsh",
  });
});

Deno.test("a word of another form decodes as nothing", () => {
  for (const decode of [adrp, adr, bl] as const) strictEqual(decode(GAME.ret, 0x1000), undefined);
  strictEqual(addImmediate(GAME.ret), undefined);
  strictEqual(loadImmediate(GAME.ret), undefined);
  strictEqual(cmpImmediate(GAME.addX21), undefined);
});

Deno.test("the test encoders produce the game's own words", () => {
  strictEqual(encode.adrp(21, GAME.adrpX21.pc, 0x1035d7000), GAME.adrpX21.word);
  strictEqual(encode.add(21, 21, 0x478), GAME.addX21);
  strictEqual(encode.bl(GAME.bl.pc, 0x10054b520), GAME.bl.word);
});

const at = 0x100335450;

Deno.test("an ADRP pairs with the ADD or load that uses its register", () => {
  const code = { addr: at, bytes: words([GAME.adrpX21.word, GAME.addX21, GAME.ldrX0X21]) };
  deepStrictEqual(resolvedReferences(code), [{ at, target: 0x1035d7478 }]);
  deepStrictEqual(referencesTo(code, 0x1035d7478), [at]);
});

Deno.test("a page is dropped on redefinition, a call, or past the window", () => {
  const page = 0x100653000;
  const redefined = words([
    encode.adrp(1, at, page),
    encode.adrp(1, at + 4, 0x100700000),
    encode.add(1, 1, 0xaee),
  ]);
  deepStrictEqual(referencesTo({ addr: at, bytes: redefined }, page + 0xaee), []);
  const called = words([
    encode.adrp(1, at, page),
    encode.bl(at + 4, 0x10054b520),
    encode.add(1, 1, 0xaee),
  ]);
  deepStrictEqual(referencesTo({ addr: at, bytes: called }, page + 0xaee), []);
  // x19 to x28 survive a call, as the calling convention says.
  const kept = words([
    encode.adrp(19, at, page),
    encode.bl(at + 4, 0x10054b520),
    encode.add(1, 19, 0xaee),
  ]);
  deepStrictEqual(referencesTo({ addr: at, bytes: kept }, page + 0xaee), [at]);
  const far = words([
    encode.adrp(1, at, page),
    ...new Array(40).fill(encode.nop),
    encode.add(1, 1, 0xaee),
  ]);
  deepStrictEqual(referencesTo({ addr: at, bytes: far }, page + 0xaee), []);
});

Deno.test("a stat getter's table is decoded from its own code", () => {
  // The game's getter head with its bound changed to three ids, the table at the address its
  // ADRP/ADD encode, and three cases: two loads and one other instruction.
  const getter = 0x10007cd50;
  const head = words([
    0x51000428, // sub w8, w1, #0x1
    0x7100091f, // cmp w8, #0x2
    0x54002d88, // b.hi
    0xf0003029, // adrp x9, 0x100683000
    0x91020129, // add x9, x9, #0x80
    0x1000008a, // adr x10, 0x10007cd74
    0x7868792b, // ldrh w11, [x9, x8, lsl #1]
    0x8b0b094a,
    0xd61f0140,
    0x79c00800, // case 0: ldrsh w0, [x0, #0x4]
    GAME.ret,
    0x79c03800, // case 2: ldrsh w0, [x0, #0x1c]
    GAME.ret,
    0x52800000, // case 4: mov w0, #0
  ]);
  const table = new Uint8Array([0, 0, 4, 0, 2, 0]);
  const read = (addr: number, n: number) => {
    const from = (bytes: Uint8Array, base: number) => {
      const out = new Uint8Array(n);
      out.set(bytes.subarray(addr - base, addr - base + n));
      return out;
    };
    return addr >= 0x100683080 ? from(table, 0x100683080) : from(head, getter);
  };
  deepStrictEqual(decodeStatGetter(read, getter), [
    { id: 1, kind: "load", offset: 4, size: 2, signed: true },
    { id: 2, kind: "other", word: 0x52800000 },
    { id: 3, kind: "load", offset: 0x1c, size: 2, signed: true },
  ]);
});

/** The installed game's arm64 slice, or undefined when the game is not installed. */
async function gameSlice(): Promise<Uint8Array | undefined> {
  try {
    return archSlice(await Deno.readFile(GAME_BINARY), "arm64");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

const BASE = 0x100000000;

Deno.test("the installed game: stats, cross-references and function starts", async () => {
  const slice = await gameSlice();
  if (!slice) return;
  const read = (addr: number, n: number) => slice.subarray(addr - BASE, addr - BASE + n);

  const stats = decodeStatGetter(read, 0x10007cd50);
  strictEqual(stats.length, 202);
  for (const f of stats.filter((s) => s.id <= 33)) {
    deepStrictEqual(f, { id: f.id, kind: "load", offset: 2 * (f.id + 1), size: 2, signed: true });
  }
  deepStrictEqual(stats[150], { id: 151, kind: "load", offset: 0x1f4, size: 2, signed: true });

  const text = section(slice, "__TEXT", "__text")!;
  const code = { bytes: slice.subarray(text.offset, text.offset + text.size), addr: text.addr };
  deepStrictEqual(referencesTo(code, 0x100653aee), [0x1003356f8]); // "Infinity_Log"

  const starts = new Set(functionStarts(slice));
  const build = parseBuilds(await Deno.readTextFile("native/builds.h"))[0];
  const functions = build.sites.slice(0, 11);
  for (const s of functions) {
    strictEqual(starts.has(BASE + s.offset), true, `${s.name} starts a function`);
    strictEqual(starts.has(BASE + s.offset + s.size), true, `${s.name} ends where the next starts`);
  }
});
