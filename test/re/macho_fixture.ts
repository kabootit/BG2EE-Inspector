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
