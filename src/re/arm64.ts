/**
 * Decoding the few arm64 instructions the reverse-engineering tools need.
 *
 * Only the forms the analysis relies on: ADRP, ADR, ADD (immediate), the
 * unsigned-offset loads, BL, and the SUBS-immediate form of CMP. Every mask
 * comparison goes through `>>> 0`: JavaScript's `&` returns a signed 32-bit
 * number, so an encoding at or above 0x80000000 (ADRP, LDR) would otherwise
 * never compare equal, which once hid every cross-reference.
 */

const u32 = (n: number) => n >>> 0;
const signExtend = (value: number, bits: number) => (value << (32 - bits)) >> (32 - bits);

/** ADRP xd, page: the 4 KB page of `pc` plus a signed 21-bit page offset. */
export function adrp(word: number, pc: number): { rd: number; page: number } | undefined {
  if (u32(word & 0x9f000000) !== 0x90000000) return undefined;
  const imm = signExtend((((word >>> 5) & 0x7ffff) << 2) | ((word >>> 29) & 3), 21);
  return { rd: word & 31, page: Math.floor(pc / 4096) * 4096 + imm * 4096 };
}

/** ADR xd, label: `pc` plus a signed 21-bit byte offset. */
export function adr(word: number, pc: number): { rd: number; target: number } | undefined {
  if (u32(word & 0x9f000000) !== 0x10000000) return undefined;
  const imm = signExtend((((word >>> 5) & 0x7ffff) << 2) | ((word >>> 29) & 3), 21);
  return { rd: word & 31, target: pc + imm };
}

/** ADD xd, xn, #imm{, lsl #12} (64-bit, no flags). */
export function addImmediate(word: number): { rd: number; rn: number; imm: number } | undefined {
  if (u32(word & 0xff800000) !== 0x91000000) return undefined;
  const shift = (word >>> 22) & 1 ? 12 : 0;
  return { rd: word & 31, rn: (word >>> 5) & 31, imm: ((word >>> 10) & 0xfff) * 2 ** shift };
}

/** The unsigned-offset load forms: their encoding, access width in bytes, and signedness. */
const LOADS: { base: number; size: number; signed: boolean; name: string }[] = [
  { base: 0x39400000, size: 1, signed: false, name: "ldrb" },
  { base: 0x39800000, size: 1, signed: true, name: "ldrsb" },
  { base: 0x39c00000, size: 1, signed: true, name: "ldrsb" },
  { base: 0x79400000, size: 2, signed: false, name: "ldrh" },
  { base: 0x79800000, size: 2, signed: true, name: "ldrsh" },
  { base: 0x79c00000, size: 2, signed: true, name: "ldrsh" },
  { base: 0xb9400000, size: 4, signed: false, name: "ldr" },
  { base: 0xb9800000, size: 4, signed: true, name: "ldrsw" },
  { base: 0xf9400000, size: 8, signed: false, name: "ldr" },
];

export type Load = {
  rt: number;
  rn: number;
  offset: number;
  size: number;
  signed: boolean;
  name: string;
};

/** LDR{B,H,SB,SH,SW} rt, [xn, #offset]: the offset is the 12-bit field scaled by the width. */
export function loadImmediate(word: number): Load | undefined {
  const form = LOADS.find((l) => u32(word & 0xffc00000) === l.base);
  if (!form) return undefined;
  return {
    rt: word & 31,
    rn: (word >>> 5) & 31,
    offset: ((word >>> 10) & 0xfff) * form.size,
    size: form.size,
    signed: form.signed,
    name: form.name,
  };
}

/** BL label: `pc` plus a signed 26-bit word offset. */
export function bl(word: number, pc: number): number | undefined {
  if (u32(word & 0xfc000000) !== 0x94000000) return undefined;
  return pc + signExtend(word & 0x3ffffff, 26) * 4;
}

/** CMP wn, #imm (SUBS wzr, wn, #imm, 32-bit, no shift). */
export function cmpImmediate(word: number): { rn: number; imm: number } | undefined {
  if (u32(word & 0xffc0001f) !== 0x7100001f) return undefined;
  return { rn: (word >>> 5) & 31, imm: (word >>> 10) & 0xfff };
}

/** A run of code: its bytes and the address of the first one. */
export type Code = { bytes: Uint8Array; addr: number };

const wordAt = (code: Code, i: number) =>
  code.bytes[i] | (code.bytes[i + 1] << 8) | (code.bytes[i + 2] << 16) | (code.bytes[i + 3] << 24);

/**
 * Every ADRP followed by an ADD or a load on the same register, as (adrp address, resolved address).
 * A pending page is dropped when the register is consumed, redefined by another ADRP, a call clobbers
 * it (x0 to x18), or after `window` instructions, so a reloaded register does not pair with a stale
 * page. A heuristic: an exact match against one string address makes a false pair very unlikely.
 */
export function resolvedReferences(code: Code, window = 32): { at: number; target: number }[] {
  const pending = new Map<number, { page: number; at: number; index: number }>();
  const out: { at: number; target: number }[] = [];
  for (let i = 0; i + 4 <= code.bytes.length; i += 4) {
    const pc = code.addr + i;
    const word = wordAt(code, i);
    const page = adrp(word, pc);
    if (page) {
      pending.set(page.rd, { page: page.page, at: pc, index: i });
      continue;
    }
    const add = addImmediate(word);
    const load = add ? undefined : loadImmediate(word);
    const rn = add?.rn ?? load?.rn;
    const from = rn === undefined ? undefined : pending.get(rn);
    if (from && i - from.index <= window * 4) {
      out.push({ at: from.at, target: from.page + (add ? add.imm : load!.offset) });
    }
    if (rn !== undefined) pending.delete(rn);
    if (add) pending.delete(add.rd);
    if (load) pending.delete(load.rt);
    if (bl(word, pc) !== undefined) { for (let r = 0; r <= 18; r++) pending.delete(r); }
  }
  return out;
}

/** The ADRP addresses of every reference that resolves to `target`. */
export const referencesTo = (code: Code, target: number) =>
  resolvedReferences(code).filter((r) => r.target === target).map((r) => r.at);

/** One case of a stat getter's jump table: the field it returns. */
export type StatField =
  | { id: number; kind: "load"; offset: number; size: number; signed: boolean }
  | { id: number; kind: "other"; word: number };

/**
 * Decode a switch-on-stat-id getter of the shape `CDerivedStats::GetAtOffset` compiles to:
 *
 *     sub  w8, w1, #first        cmp w8, #last-first     b.hi default
 *     adrp x9, table ; add x9, x9, #off                  adr  x10, base
 *     ldrh w11, [x9, x8, lsl #1] ; add x10, x10, x11, lsl #2 ; br x10
 *
 * The bound, table and case base come from the getter's own instructions, so the decoder follows a
 * rebuilt game rather than assuming addresses. `read(addr, n)` returns `n` bytes of the image.
 */
export function decodeStatGetter(
  read: (addr: number, n: number) => Uint8Array,
  getter: number,
): StatField[] {
  const head: Code = { bytes: read(getter, 64), addr: getter };
  const words = Array.from({ length: 16 }, (_, k) => wordAt(head, k * 4));
  // SUB wd, wn, #imm (32-bit): the first id the table covers.
  const sub = words.findIndex((w) => u32(w & 0xffc00000) === 0x51000000);
  const cmp = words.map(cmpImmediate).find((c) => c !== undefined);
  const refs = resolvedReferences(head);
  const base = words.map((w, k) => adr(w, getter + k * 4)).find((a) => a !== undefined);
  if (sub < 0 || !cmp || refs.length === 0 || !base) return [];
  const first = (words[sub] >>> 10) & 0xfff;
  const count = cmp.imm + 1;
  const table = read(refs[0].target, count * 2);
  return Array.from({ length: count }, (_, k) => {
    const target = base.target + (table[k * 2] | (table[k * 2 + 1] << 8)) * 4;
    const word = wordAt({ bytes: read(target, 4), addr: target }, 0);
    const load = loadImmediate(word);
    const id = first + k;
    return load && load.rn === 0
      ? { id, kind: "load" as const, offset: load.offset, size: load.size, signed: load.signed }
      : { id, kind: "other" as const, word };
  });
}
