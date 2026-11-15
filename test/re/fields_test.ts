import { deepStrictEqual, strictEqual } from "node:assert/strict";
import type { Code } from "../../src/re/arm64.ts";
import { areaFields, idFields } from "../../src/re/fields.ts";
import { archSlice, section } from "../../src/re/macho.ts";
import { GAME_BINARY } from "../../src/shared/config.ts";
import { encode, words } from "./macho_fixture.ts";

const AT = 0x100001000;
const code = (ws: number[]): Code => ({ bytes: words(ws), addr: AT });
const { ldr, cmp, movz, nop } = encode;

// The shape of the comparison at 0x100086824: the object's area against the area on screen.
const visibleArea = (objectField: number) => [
  ldr(8, 0, objectField, 8), // ldr x8, [x0, #field]
  movz(10, 0x6590), // mov w10, #0x6590
  nop, // ldrb w10, [x9, x10]
  nop, // add x9, x9, x10, lsl #3
  ldr(9, 9, 0x6598, 8), // ldr x9, [x9, #0x6598]
  cmp(8, 9, 8), // cmp x8, x9
];

// The shape of the comparison at 0x1000beba4: an object's id against a field of its own area.
const ownArea = (areaField: number, areaFrom = 19, areaAt = 0x18) => [
  ldr(12, 19, 0x48, 4), // ldr w12, [x19, #0x48]
  ldr(8, areaFrom, areaAt, 8), // ldr x8, [x19, #0x18]
  ldr(13, 8, areaField, 4), // ldr w13, [x8, #field]
  cmp(12, 13, 4), // cmp w12, w13
];

Deno.test("area fields: the object field compared with the area on screen", () => {
  deepStrictEqual(areaFields(code(visibleArea(0x18))), [[0x18, [AT + 20]]]);
});

Deno.test("area fields: a comparison too far away, or of another register, is not counted", () => {
  const far = visibleArea(0x18);
  far.splice(5, 0, ...Array(14).fill(nop));
  deepStrictEqual(areaFields(code(far)), []);
  const other = visibleArea(0x18);
  other[5] = cmp(8, 7, 8);
  deepStrictEqual(areaFields(code(other)), []);
});

Deno.test("id fields: the area field compared with an object's own id", () => {
  deepStrictEqual(idFields(code(ownArea(0x244))), [[0x244, [AT + 12]]]);
});

Deno.test("id fields: another object's area, or a pointer that is not the area, is not counted", () => {
  deepStrictEqual(idFields(code(ownArea(0x244, 20))), []);
  deepStrictEqual(idFields(code(ownArea(0x244, 19, 0x20))), []);
});

Deno.test("a tally lists the most used field first, each with its sites", () => {
  const ws = [...ownArea(0x248), ...ownArea(0x244), ...ownArea(0x244)];
  deepStrictEqual(idFields(code(ws)), [[0x244, [AT + 28, AT + 44]], [0x248, [AT + 12]]]);
});

/** The installed game's code, or undefined when the game is not installed. */
async function gameCode(): Promise<Code | undefined> {
  try {
    const slice = archSlice(await Deno.readFile(GAME_BINARY), "arm64")!;
    const text = section(slice, "__TEXT", "__text")!;
    return { bytes: slice.subarray(text.offset, text.offset + text.size), addr: text.addr };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

// The counts docs/re-notes.md cites: a game update that changes them fails here first.
Deno.test("the installed game: the object's area at +0x18, the picked object at area +0x244", async () => {
  const game = await gameCode();
  if (!game) return;
  const area = areaFields(game);
  deepStrictEqual([area[0][0], area[0][1].length], [0x18, 14]);
  strictEqual(area[0][1].includes(0x100086824), true);
  const ids = idFields(game);
  deepStrictEqual(ids.slice(0, 2).map(([offset, sites]) => [offset, sites.length]), [
    [0x244, 24],
    [0x248, 11],
  ]);
  strictEqual(ids[0][1].includes(0x1000beba4), true);
});
