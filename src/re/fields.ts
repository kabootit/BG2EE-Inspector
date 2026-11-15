/**
 * Finding engine fields by what the engine compares them with. Each tally walks the game's code for
 * a CMP of two registers, follows each register back to the load that filled it, and counts which
 * field offset meets a known value. The field asked about is the offset with by far the most
 * comparisons; docs/re-notes.md records the counts.
 *
 * - areaFields: which object field holds the area the object is in? The engine compares it with the
 *   area on screen, `CInfGame` areas[visible index].
 * - idFields: which area fields hold an object id? The engine compares them with an object's own id,
 *   reading the area through the object.
 *
 * Registers are followed by pattern within a short window, not by data flow: a heuristic, trusted
 * because the winning count stands far above the rest and the result is checked in the game.
 */
import { cmpRegister, type Code, type Load, loadImmediate, moveWide } from "./arm64.ts";

/** Field offset to the addresses of the comparisons that use it, most used first. */
export type Tally = [offset: number, sites: number[]][];

/** The offsets the questions start from, as a7xoff.lua has them. */
export const LAYOUT = {
  visibleIndex: 0x6590, // CInfGame: u8 index of the area on screen
  areas: 0x6598, // CInfGame: the areas array
  objectId: 0x48, // CGameObject: i32 id
  objectArea: 0x18, // CGameObject: the CGameArea it is in
};

type Found = { at: number; load: Load };

/** Instruction words, and the address of the word at an index. */
type Instructions = { words: number[]; addr: (i: number) => number };

/** The code as instruction words, with the address of each. */
function instructions(code: Code): Instructions {
  const view = new DataView(code.bytes.buffer, code.bytes.byteOffset, code.bytes.byteLength);
  const words = Array.from(
    { length: code.bytes.length >>> 2 },
    (_, i) => view.getUint32(i * 4, true),
  );
  return { words, addr: (i: number) => code.addr + 4 * i };
}

/**
 * The nearest unsigned-offset `ldr` into register `rt` of `size` bytes, looking back from `before`
 * (exclusive) to `from` (inclusive).
 */
function loadInto(
  words: number[],
  rt: number,
  size: number,
  before: number,
  from: number,
): Found | undefined {
  for (let at = before - 1; at >= Math.max(from, 0); at--) {
    const load = loadImmediate(words[at]);
    if (load && load.rt === rt && load.size === size && !load.signed) return { at, load };
  }
  return undefined;
}

const tally = (hits: [offset: number, site: number][]): Tally => {
  const sites = Map.groupBy(hits, ([offset]) => offset);
  return [...sites]
    .map(([offset, group]): Tally[number] => [offset, group.map(([, site]) => site)])
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
};

/**
 * The object fields compared with the area on screen. The pattern: `mov wN, #visibleIndex`, then
 * within 8 instructions `ldr xV, [.., #areas]` (the area on screen), then within 14 a `cmp` of xV
 * with another register; that register's load gives the object field.
 */
export function areaFields(code: Code, layout = LAYOUT): Tally {
  const { words, addr } = instructions(code);
  const hits: [number, number][] = [];
  words.forEach((word, i) => {
    if (moveWide(word)?.value !== layout.visibleIndex) return;
    const visible = words.slice(i, i + 8).map(loadImmediate)
      .findIndex((l) => l?.size === 8 && l.offset === layout.areas);
    if (visible < 0) return;
    const v = i + visible, area = loadImmediate(words[v])!.rt;
    for (let c = v + 1; c < v + 14 && c < words.length; c++) {
      const cmp = cmpRegister(words[c]);
      if (cmp?.size !== 8 || (cmp.rn !== area && cmp.rm !== area)) continue;
      const other = loadInto(words, cmp.rn === area ? cmp.rm : cmp.rn, 8, c, i - 19);
      if (other) hits.push([other.load.offset, addr(c)]);
      return;
    }
  });
  return tally(hits);
}

/**
 * The area fields compared with an object's own id. The pattern: `cmp wA, wB` where, within the 12
 * instructions before it, one side was loaded from `[xO, #objectId]` and the other from
 * `[xR, #field]`, and xR was last loaded from `[xO, #objectArea]`: the object's own area.
 */
export function idFields(code: Code, layout = LAYOUT): Tally {
  const { words, addr } = instructions(code);
  const hits: [number, number][] = [];
  words.forEach((word, i) => {
    const cmp = cmpRegister(word);
    if (cmp?.size !== 4) return;
    const a = loadInto(words, cmp.rn, 4, i, i - 12);
    const b = loadInto(words, cmp.rm, 4, i, i - 12);
    if (!a || !b) return;
    for (const [id, field] of [[a, b], [b, a]] as [Found, Found][]) {
      if (id.load.offset !== layout.objectId) continue;
      const area = loadInto(words, field.load.rn, 8, field.at, field.at - 12);
      if (area?.load.offset === layout.objectArea && area.load.rn === id.load.rn) {
        hits.push([field.load.offset, addr(i)]);
      }
    }
  });
  return tally(hits);
}
