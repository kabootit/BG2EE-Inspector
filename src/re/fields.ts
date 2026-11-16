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
 * - listFields: which object fields head a linked list whose elements the engine tests against
 *   constants? For a creature these are its effect lists, the element field its opcode.
 *
 * Registers are followed by pattern within a short window, not by data flow: a heuristic, trusted
 * because the winning count stands far above the rest and the result is checked in the game.
 */
import {
  cmpImmediate,
  cmpRegister,
  type Code,
  type Load,
  loadImmediate,
  moveWide,
} from "./arm64.ts";

/** Field offset to the addresses of the comparisons that use it, most used first. */
export type Tally = [offset: number, sites: number[]][];

/** The offsets the questions start from, as inspoff.lua has them. */
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

/** A list the engine walks: its head's offset, the element field it tests, where, and against what. */
export type ListField = { head: number; field: number; sites: number[]; constants: number[] };

/** The object offsets searched for list heads: a creature's large fields, past its stats blocks. */
export const LIST_HEADS = { from: 0x4000, to: 0x6000 };

/**
 * The fields of linked-list elements the engine compares with a constant, by the object offset of the
 * list's head, most used first. The pattern: `ldr xH, [xS, #head]`, then within 8 instructions
 * `ldr xE, [xH, #0x10]` (a list node holds its element at +0x10, after the next and previous
 * pointers), within 4 more `ldr wF, [xE, #field]`, and within 3 more `cmp wF, #imm`.
 */
export function listFields(code: Code, heads = LIST_HEADS): ListField[] {
  const { words, addr } = instructions(code);
  const found = new Map<string, ListField>();
  const load = (i: number): Load | undefined => loadImmediate(words[i]);
  words.forEach((_, i) => {
    const head = load(i);
    if (head?.size !== 8 || head.rn === 31 || head.offset < heads.from || head.offset > heads.to) {
      return;
    }
    const e = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => i + d).find((j) => {
      const l = load(j);
      return l?.size === 8 && l.rn === head.rt && l.offset === 0x10;
    });
    if (e === undefined) return;
    const element = load(e)!.rt;
    const f = [1, 2, 3, 4].map((d) => e + d).find((k) => {
      const l = load(k);
      return l?.size === 4 && !l.signed && l.rn === element;
    });
    if (f === undefined) return;
    const field = load(f)!;
    const cmp = [1, 2, 3].map((d) => cmpImmediate(words[f + d])).find((c) => c?.rn === field.rt);
    if (!cmp) return;
    const key = `${head.offset}:${field.offset}`;
    const list = found.get(key) ??
      { head: head.offset, field: field.offset, sites: [], constants: [] };
    list.sites.push(addr(i));
    if (!list.constants.includes(cmp.imm)) list.constants.push(cmp.imm);
    found.set(key, list);
  });
  return [...found.values()]
    .map((l): ListField => ({ ...l, constants: l.constants.sort((a, b) => a - b) }))
    .sort((a, b) => b.sites.length - a.sites.length || a.head - b.head);
}
