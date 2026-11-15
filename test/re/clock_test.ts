import { deepStrictEqual, strictEqual } from "node:assert/strict";
import type { Code } from "../../src/re/arm64.ts";
import { gameClock } from "../../src/re/clock.ts";
import { archSlice, cstringAddresses, section, sections } from "../../src/re/macho.ts";
import { GAME_BINARY } from "../../src/shared/config.ts";
import { encode, words } from "./macho_fixture.ts";

const AT = 0x100001000;
const CLOSURE = AT, REGISTRATION = AT + 0x40;
const ROOT = 0x1035d70d0, MULTIPLIER = 0x100798778, NAME = 0x100653996;
const { adrp, add, ldr, mul, lsl, nop } = encode;

// The shape of Infinity_GetGameTicks at 0x100336a68 and its registration at 0x1003354a4.
const closure = (multiplied = true) => [
  nop, // stp x29, x30, [sp, #-0x10]!
  nop, // mov x29, sp
  adrp(8, CLOSURE + 8, ROOT),
  add(8, 8, ROOT & 0xfff),
  ldr(8, 8, 0, 8), // ldr x8, [x8]
  ldr(8, 8, 0x10c0, 8),
  adrp(9, CLOSURE + 24, MULTIPLIER),
  add(9, 9, MULTIPLIER & 0xfff),
  ldr(8, 8, 0x3fa0, 4),
  ldr(9, 9, 0, 4),
  multiplied ? mul(8, 8, 9) : nop,
  lsl(8, 8, 1),
  nop, // ucvtf d0, w8
  nop, // bl lua_pushnumber
  nop, // mov w0, #0x1
  nop, // ret
];
const registration = [
  adrp(1, REGISTRATION, CLOSURE),
  add(1, 1, CLOSURE & 0xfff),
  nop, // mov w2, #0x0
  nop, // bl lua_pushcclosure
  nop, // ldr x0, [x21]
  adrp(1, REGISTRATION + 20, NAME),
  add(1, 1, NAME & 0xfff),
  nop, // bl lua_setglobal
];
const code = (body: number[]): Code => ({ bytes: words([...body, ...registration]), addr: AT });

Deno.test("the clock: the pointer chain from the root, the multiplier and the shift", () => {
  deepStrictEqual(gameClock(code(closure()), NAME), {
    registration: REGISTRATION + 20,
    closure: CLOSURE,
    root: ROOT,
    chain: [0, 0x10c0, 0x3fa0],
    width: 4,
    multiplier: MULTIPLIER,
    shift: 1,
  });
});

Deno.test("the clock: another shape, or a name nothing loads, gives nothing", () => {
  strictEqual(gameClock(code(closure(false)), NAME), undefined);
  strictEqual(gameClock(code(closure()), NAME + 1), undefined);
});

// The chain docs/re-notes.md cites: a game update that changes it fails here first.
Deno.test("the installed game: the clock at CInfGame +0x3fa0, times a global in __data, times 2", async () => {
  let slice: Uint8Array;
  try {
    slice = archSlice(await Deno.readFile(GAME_BINARY), "arm64")!;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  const text = section(slice, "__TEXT", "__text")!;
  const game = { bytes: slice.subarray(text.offset, text.offset + text.size), addr: text.addr };
  const clock = gameClock(game, cstringAddresses(slice, "Infinity_GetGameTicks")[0])!;
  deepStrictEqual(
    [clock.root, clock.chain, clock.width, clock.shift],
    [0x1035d70d0, [0, 0x10c0, 0x3fa0], 4, 1],
  );
  const where = sections(slice).find((s) =>
    clock.multiplier >= s.addr && clock.multiplier < s.addr + s.size
  )!;
  deepStrictEqual([where.segname, where.sectname], ["__DATA", "__data"]);
  const view = new DataView(slice.buffer, slice.byteOffset);
  strictEqual(view.getUint32(where.offset + clock.multiplier - where.addr, true), 30);
});
