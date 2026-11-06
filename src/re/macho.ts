/**
 * Reading Mach-O headers.
 *
 * Which CPU architectures a file contains, enough for doctor to tell an arm64
 * binary from an x86_64 one without running it; and, for the address-table
 * test, one architecture's slice with its load commands, LC_UUID and segments.
 * Every count and offset comes from the file, so each is bounded by the bytes
 * actually present.
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

/** The fat entry layouts: where the slice's offset and size are, and how wide they are. */
const fatEntryRange = (view: DataView, at: number, entrySize: 20 | 32) =>
  entrySize === 20
    ? { offset: view.getUint32(at + 8, false), size: view.getUint32(at + 12, false) }
    : {
      offset: Number(view.getBigUint64(at + 8, false)),
      size: Number(view.getBigUint64(at + 16, false)),
    };

/**
 * The bytes of one architecture's slice: the whole file when it is thin and that architecture,
 * the matching fat entry's range when universal, otherwise undefined. A range reaching past the
 * end of the file is treated as absent.
 */
export function archSlice(bytes: Uint8Array, arch: string): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readHeader(view);
  switch (header.kind) {
    case "thin":
      return name(header.cpu) === arch ? bytes : undefined;
    case "fat": {
      const at = fatEntryOffsets(header.count, header.entrySize, view.byteLength)
        .find((at) => name(view.getUint32(at, false)) === arch);
      if (at === undefined) return undefined;
      const { offset, size } = fatEntryRange(view, at, header.entrySize);
      return offset + size <= bytes.length ? bytes.subarray(offset, offset + size) : undefined;
    }
    case "none":
      return undefined;
  }
}

const MACH_HEADER_64_SIZE = 32;
const LC_SEGMENT_64 = 0x19;
const LC_UUID = 0x1b;

/** One load command: its type, and where it starts and how long it is within the slice. */
export type LoadCommand = { cmd: number; at: number; size: number };

/**
 * The load commands of a thin 64-bit slice, in order. Walks at most `ncmds` commands and stops at
 * the first one that is shorter than its own header or runs past `sizeofcmds` or the slice. A loop,
 * not recursion: the count is the file's claim, and each command is at least 8 bytes, so the walk is
 * bounded by the bytes present without depending on stack depth.
 */
export function loadCommands(slice: Uint8Array): LoadCommand[] {
  if (slice.length < MACH_HEADER_64_SIZE) return [];
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  if (view.getUint32(0, true) !== MH_MAGIC_64) return [];
  const ncmds = view.getUint32(16, true);
  const end = Math.min(MACH_HEADER_64_SIZE + view.getUint32(20, true), slice.length);
  const commands: LoadCommand[] = [];
  for (let at = MACH_HEADER_64_SIZE; commands.length < ncmds && at + 8 <= end;) {
    const size = view.getUint32(at + 4, true);
    if (size < 8 || at + size > end) break;
    commands.push({ cmd: view.getUint32(at, true), at, size });
    at += size;
  }
  return commands;
}

/** The slice's LC_UUID in the usual 8-4-4-4-12 uppercase form, or undefined if it has none. */
export function imageUuid(slice: Uint8Array): string | undefined {
  const lc = loadCommands(slice).find((c) => c.cmd === LC_UUID && c.size >= 24);
  if (!lc) return undefined;
  const hex = Array.from(slice.subarray(lc.at + 8, lc.at + 24))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
    .join("-");
}

/** Where a segment sits in memory and in the file. */
export type Segment = { vmaddr: number; vmsize: number; fileoff: number; filesize: number };

/** The named LC_SEGMENT_64, or undefined. Values above 2^53 are not expected in a Mach-O slice. */
export function segment(slice: Uint8Array, segname: string): Segment | undefined {
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  const lc = loadCommands(slice).find((c) =>
    c.cmd === LC_SEGMENT_64 && c.size >= 72 &&
    new TextDecoder().decode(slice.subarray(c.at + 8, c.at + 24)).replace(/\0+$/, "") === segname
  );
  if (!lc) return undefined;
  const u64 = (off: number) => Number(view.getBigUint64(lc.at + off, true));
  return { vmaddr: u64(24), vmsize: u64(32), fileoff: u64(40), filesize: u64(48) };
}
