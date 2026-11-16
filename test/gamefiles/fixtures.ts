/**
 * Synthetic game files for the gamefiles tests: a KEY, a BIFF, a TLK, a CRE and spell and item
 * headers, laid out as IESDP gives them, holding only the fields the readers use; and a disk in
 * memory to hold them.
 */
import { CRE_HEADER_SIZE } from "../../src/gamefiles/iebinary.ts";
import type { Disk } from "../../src/gamefiles/resources.ts";

const ascii = (s: string) => new TextEncoder().encode(s);

/** A KEY V1 with one archive and the given resources, all in it. */
export function keyFile(
  biffName: string,
  resources: { resref: string; type: number; fileIndex: number }[],
): Uint8Array {
  const biffsAt = 0x18;
  const nameAt = biffsAt + 12;
  const name = ascii(biffName.replace(/\//g, "\\") + "\0");
  const resourcesAt = nameAt + name.length;
  const bytes = new Uint8Array(resourcesAt + resources.length * 14);
  const dv = new DataView(bytes.buffer);
  bytes.set(ascii("KEY V1  "), 0);
  dv.setUint32(0x08, 1, true);
  dv.setUint32(0x0c, resources.length, true);
  dv.setUint32(0x10, biffsAt, true);
  dv.setUint32(0x14, resourcesAt, true);
  dv.setUint32(biffsAt + 0x04, nameAt, true);
  dv.setUint16(biffsAt + 0x08, name.length, true);
  bytes.set(name, nameAt);
  resources.forEach((r, i) => {
    const at = resourcesAt + i * 14;
    bytes.set(ascii(r.resref.padEnd(8, "\0")), at);
    dv.setUint16(at + 0x08, r.type, true);
    dv.setUint32(at + 0x0a, (0 << 20) | r.fileIndex, true); // archive 0
  });
  return bytes;
}

/** A BIFF V1 holding `files`; its table lists them in reverse, so position is not the locator. */
export function biffFile(
  files: { fileIndex: number; type: number; bytes: Uint8Array }[],
): Uint8Array {
  const entriesAt = 20;
  let dataAt = entriesAt + files.length * 16;
  const placed = files.map((f) => {
    const at = dataAt;
    dataAt += f.bytes.length;
    return { ...f, at };
  });
  const bytes = new Uint8Array(dataAt);
  const dv = new DataView(bytes.buffer);
  bytes.set(ascii("BIFFV1  "), 0);
  dv.setUint32(0x08, files.length, true);
  dv.setUint32(0x10, entriesAt, true);
  [...placed].reverse().forEach((f, i) => {
    const at = entriesAt + i * 16;
    dv.setUint32(at, f.fileIndex, true);
    dv.setUint32(at + 0x04, f.at, true);
    dv.setUint32(at + 0x08, f.bytes.length, true);
    dv.setUint16(at + 0x0c, f.type, true);
    bytes.set(f.bytes, f.at);
  });
  return bytes;
}

/** A TLK V1 file of these strings, laid out as IESDP has it; an empty string has length 0. */
export function tlkFile(strings: string[]): Uint8Array {
  const text = strings.map((s) => ascii(s));
  const stringsAt = 18 + 26 * strings.length;
  const bytes = new Uint8Array(stringsAt + text.reduce((n, t) => n + t.length, 0));
  const dv = new DataView(bytes.buffer);
  bytes.set(ascii("TLK V1  "), 0);
  dv.setUint32(0x0a, strings.length, true);
  dv.setUint32(0x0e, stringsAt, true);
  let offset = 0;
  text.forEach((t, i) => {
    dv.setUint32(18 + 26 * i + 0x12, offset, true); // relative to the strings, not the file
    dv.setUint32(18 + 26 * i + 0x16, t.length, true);
    bytes.set(t, stringsAt + offset);
    offset += t.length;
  });
  return bytes;
}

/** A spell's or item's header, `SPL V1  ` or `ITM V1  `, with only its two name strrefs. */
export function nameHeader(
  signature: string,
  unidentified: number,
  identified: number,
): Uint8Array {
  const bytes = new Uint8Array(0x10);
  bytes.set(ascii(signature), 0);
  new DataView(bytes.buffer).setInt32(0x08, unidentified, true);
  new DataView(bytes.buffer).setInt32(0x0c, identified, true);
  return bytes;
}

/** A game folder in memory, by path: missing files are NotFound, as on a real disk. */
export function memoryDisk(files: Map<string, Uint8Array>): Disk {
  return {
    readFile(path): Promise<Uint8Array> {
      const bytes = files.get(path);
      return bytes ? Promise.resolve(bytes) : Promise.reject(new Deno.errors.NotFound(path));
    },
    readAt(path, offset, length): Promise<Uint8Array | null> {
      const bytes = files.get(path);
      if (!bytes || offset + length > bytes.length) return Promise.resolve(null);
      return Promise.resolve(bytes.slice(offset, offset + length));
    },
    listDir(path): Promise<string[]> {
      const prefix = `${path}/`;
      return Promise.resolve(
        [...files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)),
      );
    },
  };
}

/** A CRE V1.0 header with the fields the reader takes, negative values included. */
export function creFile(): Uint8Array {
  const bytes = new Uint8Array(CRE_HEADER_SIZE);
  const dv = new DataView(bytes.buffer);
  bytes.set(ascii("CRE V1.0"), 0);
  dv.setUint32(0x08, 1234, true);
  dv.setUint16(0x24, 30, true);
  dv.setUint16(0x26, 48, true);
  dv.setInt16(0x46, 5, true);
  dv.setInt16(0x48, 4, true);
  dv.setInt16(0x4a, -1, true);
  dv.setInt16(0x4c, 2, true);
  dv.setInt16(0x4e, 0, true);
  dv.setInt16(0x50, -3, true);
  bytes[0x52] = 17;
  bytes[0x23c] = 18; // DEX
  [13, 15, 14, 16, 16].forEach((v, i) => dv.setInt8(0x54 + i, v));
  [-25, 100, 40, 100, 0, -25, 100, 50, 50, 50, 80].forEach((v, i) => dv.setInt8(0x59 + i, v));
  bytes[0x270] = 128;
  dv.setUint32(0x2c0, 2, true);
  dv.setUint32(0x2c8, 3, true);
  return bytes;
}
