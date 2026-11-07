/**
 * Small, valid thin arm64 Mach-O images for the reader and builds tests: a
 * header, an LC_UUID and one LC_SEGMENT_64 named __TEXT that maps file offset 0
 * to 0x100000000 and covers the whole image, followed by caller-supplied code.
 */
export const IMAGE_CODE_AT = 32 + 24 + 72; // header, LC_UUID, LC_SEGMENT_64

export type ImageOptions = { uuid?: Uint8Array; code?: Uint8Array; textFileoff?: number };

export function machoImage(options: ImageOptions = {}): Uint8Array {
  const uuid = options.uuid ?? Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const code = options.code ?? new Uint8Array(64);
  const bytes = new Uint8Array(IMAGE_CODE_AT + code.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, 0x0100000c, true); // arm64
  view.setUint32(12, 2, true); // MH_EXECUTE
  view.setUint32(16, 2, true); // ncmds
  view.setUint32(20, 24 + 72, true); // sizeofcmds
  view.setUint32(32, 0x1b, true); // LC_UUID
  view.setUint32(36, 24, true);
  bytes.set(uuid, 40);
  view.setUint32(56, 0x19, true); // LC_SEGMENT_64
  view.setUint32(60, 72, true);
  bytes.set(new TextEncoder().encode("__TEXT"), 64);
  view.setBigUint64(80, 0x100000000n, true); // vmaddr
  view.setBigUint64(88, BigInt(bytes.length), true); // vmsize
  view.setBigUint64(96, BigInt(options.textFileoff ?? 0), true); // fileoff
  view.setBigUint64(104, BigInt(bytes.length), true); // filesize
  bytes.set(code, IMAGE_CODE_AT);
  return bytes;
}

/** A universal binary holding `slices` as (cpu type, bytes), 4096-aligned like real ones. */
export function universal(slices: [number, Uint8Array][]): Uint8Array {
  const offsets = slices.map((_, i) => 4096 * (i + 1));
  const total = offsets.at(-1)! + slices.at(-1)![1].length;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xcafebabe, false);
  view.setUint32(4, slices.length, false);
  slices.forEach(([cpu, slice], i) => {
    const at = 8 + i * 20;
    view.setUint32(at, cpu, false);
    view.setUint32(at + 8, offsets[i], false);
    view.setUint32(at + 12, slice.length, false);
    bytes.set(slice, offsets[i]);
  });
  return bytes;
}

/**
 * A thin arm64 image with one __TEXT segment holding __text (the given code, at `CODE_VA`) and
 * __cstring (the given strings, NUL-separated), and an LC_FUNCTION_STARTS listing `starts`.
 */
export const CODE_VA = 0x100001000;

export type RichImage = { bytes: Uint8Array; cstringVa: number };

export function richImage(code: Uint8Array, strings: string[], starts: number[]): RichImage {
  const header = 32, segment = 72 + 2 * 80, fstarts = 16;
  const cmds = segment + fstarts;
  const codeOff = 0x1000; // CODE_VA - 0x100000000
  const cstr = new TextEncoder().encode(strings.map((s) => `${s}\0`).join(""));
  const cstrOff = codeOff + code.length;
  const uleb = (n: number) => {
    const out: number[] = [];
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
    return out;
  };
  const deltas = starts.flatMap((s, i) => uleb(s - (i === 0 ? 0x100000000 : starts[i - 1])));
  const startsOff = cstrOff + cstr.length;
  const bytes = new Uint8Array(startsOff + deltas.length + 1);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0xfeedfacf, true);
  v.setUint32(4, 0x0100000c, true);
  v.setUint32(12, 2, true);
  v.setUint32(16, 2, true);
  v.setUint32(20, cmds, true);
  let at = header;
  v.setUint32(at, 0x19, true);
  v.setUint32(at + 4, segment, true);
  bytes.set(new TextEncoder().encode("__TEXT"), at + 8);
  v.setBigUint64(at + 24, 0x100000000n, true);
  v.setBigUint64(at + 32, BigInt(bytes.length), true);
  v.setBigUint64(at + 40, 0n, true);
  v.setBigUint64(at + 48, BigInt(bytes.length), true);
  v.setUint32(at + 64, 2, true);
  const sect = (i: number, name: string, addr: number, size: number, offset: number) => {
    const s = at + 72 + i * 80;
    bytes.set(new TextEncoder().encode(name), s);
    bytes.set(new TextEncoder().encode("__TEXT"), s + 16);
    v.setBigUint64(s + 32, BigInt(addr), true);
    v.setBigUint64(s + 40, BigInt(size), true);
    v.setUint32(s + 48, offset, true);
  };
  sect(0, "__text", CODE_VA, code.length, codeOff);
  sect(1, "__cstring", 0x100000000 + cstrOff, cstr.length, cstrOff);
  at += segment;
  v.setUint32(at, 0x26, true);
  v.setUint32(at + 4, fstarts, true);
  v.setUint32(at + 8, startsOff, true);
  v.setUint32(at + 12, deltas.length + 1, true);
  bytes.set(code, codeOff);
  bytes.set(cstr, cstrOff);
  bytes.set(deltas, startsOff);
  return { bytes, cstringVa: 0x100000000 + cstrOff };
}

/** Little-endian bytes of 32-bit instruction words. */
export const words = (ws: number[]) => {
  const out = new Uint8Array(ws.length * 4);
  ws.forEach((w, i) => new DataView(out.buffer).setUint32(i * 4, w >>> 0, true));
  return out;
};

/** Encoders for the forms arm64.ts decodes, checked in arm64_test.ts against words from the game. */
export const encode = {
  adrp: (rd: number, pc: number, target: number) => {
    const imm = (Math.floor(target / 4096) - Math.floor(pc / 4096)) & 0x1fffff;
    return (0x90000000 | ((imm & 3) << 29) | ((imm >>> 2) << 5) | rd) >>> 0;
  },
  add: (rd: number, rn: number, imm: number) => (0x91000000 | (imm << 10) | (rn << 5) | rd) >>> 0,
  bl: (pc: number, target: number) => (0x94000000 | (((target - pc) / 4) & 0x3ffffff)) >>> 0,
  nop: 0xd503201f,
};
