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

const name = (cpu: number) => CPU_TYPES[cpu] ?? `cpu-0x${cpu.toString(16)}`;

/** The architectures in a Mach-O or universal binary; empty if the bytes are neither. */
export function machoArchs(bytes: Uint8Array): string[] {
  if (bytes.length < 8) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) === MH_MAGIC_64) return [name(view.getUint32(4, true))];
  const magic = view.getUint32(0, false);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) return [];
  const count = view.getUint32(4, false);
  const entrySize = magic === FAT_MAGIC ? 20 : 32;
  const archs: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + i * entrySize;
    if (at + 4 > bytes.length) break;
    archs.push(name(view.getUint32(at, false)));
  }
  return archs;
}
