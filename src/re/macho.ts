/**
 * Reading Mach-O headers.
 *
 * For now, only which CPU architectures a file contains: enough for doctor to
 * tell an arm64 binary from an x86_64 one without running it. Phase 1 adds
 * segment, section and string reading here.
 */

const CPU_TYPES: Record<number, string> = {
  0x00000007: "i386",
  0x01000007: "x86_64",
  0x0000000c: "arm",
  0x0100000c: "arm64",
};

const MH_MAGIC_64 = 0xfeedfacf; // thin 64-bit, stored little-endian on Apple platforms
const FAT_MAGIC = 0xcafebabe; // universal, stored big-endian
const FAT_MAGIC_64 = 0xcafebabf;

const FAT_HEADER_SIZE = 8; // magic + entry count

const name = (cpu: number) => CPU_TYPES[cpu] ?? `cpu-0x${cpu.toString(16)}`;

/** What the first eight bytes say the file is. */
export type MachoHeader =
  | { kind: "thin"; cpu: number }
  | { kind: "fat"; count: number; entrySize: 20 | 32 }
  | { kind: "none" };

/** Classify a file from its header alone. */
export function readHeader(view: DataView): MachoHeader {
  if (view.byteLength < FAT_HEADER_SIZE) return { kind: "none" };
  if (view.getUint32(0, true) === MH_MAGIC_64) {
    return { kind: "thin", cpu: view.getUint32(4, true) };
  }
  const magic = view.getUint32(0, false);
  const count = view.getUint32(4, false);
  if (magic === FAT_MAGIC) return { kind: "fat", count, entrySize: 20 };
  if (magic === FAT_MAGIC_64) return { kind: "fat", count, entrySize: 32 };
  return { kind: "none" };
}

/**
 * Offsets of the fat entries that fit completely in the file.
 *
 * The count comes from the file, which is untrusted: a corrupt or hostile header can claim up to
 * 2^32-1 entries. Capping at what the bytes can hold keeps the array (and the work) bounded by the
 * file size rather than by the claim.
 */
export function fatEntryOffsets(count: number, entrySize: number, byteLength: number): number[] {
  const fit = Math.max(0, Math.floor((byteLength - FAT_HEADER_SIZE) / entrySize));
  return Array.from({ length: Math.min(count, fit) }, (_, i) => FAT_HEADER_SIZE + i * entrySize);
}

/** The architectures in a Mach-O or universal binary; empty if the bytes are neither. */
export function machoArchs(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readHeader(view);
  switch (header.kind) {
    case "thin":
      return [name(header.cpu)];
    case "fat":
      return fatEntryOffsets(header.count, header.entrySize, view.byteLength)
        .map((at) => name(view.getUint32(at, false)));
    case "none":
      return [];
  }
}
