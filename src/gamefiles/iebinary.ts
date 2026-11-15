/**
 * Readers for the Infinity Engine's file formats: the resource index (KEY), the archives (BIFF),
 * creatures (CRE) and tables (2DA). Pure functions over bytes, no I/O; `resources.ts` does the
 * reading.
 *
 * Adapted from BG2EE-GameLog's `src/iebinary.ts` (same author), trimmed to what the spawn check
 * needs, with the CRE reader extended by the AC modifiers, Dexterity, EA, and item and effect
 * counts, and a 2DA reader added. Every
 * offset is from IESDP (https://gibberlings3.github.io/iesdp/file_formats/), and integers are
 * little-endian. A wrong offset does not throw, it reads a plausible number, so the spawn check
 * compares what these give with what the walker reads in the game.
 */

const ASCII = new TextDecoder("ascii");

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** A fixed-length ASCII field, NUL-padded: signatures and resrefs. */
function fixedString(bytes: Uint8Array, at: number, length: number): string {
  const raw = ASCII.decode(bytes.subarray(at, Math.min(at + length, bytes.length)));
  const nul = raw.indexOf("\0");
  return (nul === -1 ? raw : raw.slice(0, nul)).trim();
}

/** Throw unless the bytes start with `signature` (4 characters) and `version` (4). */
function expect(bytes: Uint8Array, signature: string, version: string): void {
  const found = `${fixedString(bytes, 0, 4)} ${fixedString(bytes, 4, 4)}`;
  if (found !== `${signature} ${version}`) {
    throw new Error(`not a ${signature} ${version} file: it starts "${found}"`);
  }
}

/** Resource type codes in the KEY, for the types read here. */
export const RES_TYPE = { cre: 0x03f1, "2da": 0x03f4, menu: 0x0408 } as const;

// KEY: chitin.key, the index of every resource in the archives.

export type KeyEntry = { resref: string; type: number; biff: number; fileIndex: number };
export type KeyIndex = { biffs: string[]; entries: KeyEntry[] };

/**
 * Parse `chitin.key`. A resource's locator packs the archive index in bits 31 to 20 and the file
 * index in bits 13 to 0; the bits between are a tileset index, unused for creatures.
 */
export function readKey(bytes: Uint8Array): KeyIndex {
  expect(bytes, "KEY", "V1");
  const dv = view(bytes);
  const biffCount = dv.getUint32(0x08, true);
  const resourceCount = dv.getUint32(0x0c, true);
  const biffsAt = dv.getUint32(0x10, true);
  const resourcesAt = dv.getUint32(0x14, true);
  const biffs = Array.from({ length: biffCount }, (_, i) => {
    const at = biffsAt + i * 12;
    const nameAt = dv.getUint32(at + 0x04, true);
    const nameLength = dv.getUint16(at + 0x08, true); // includes the NUL
    const raw = ASCII.decode(bytes.subarray(nameAt, nameAt + Math.max(0, nameLength - 1)));
    return raw.replace(/\\/g, "/").replace(/\0+$/, "");
  });
  const entries: KeyEntry[] = [];
  for (let i = 0; i < resourceCount; i++) {
    const at = resourcesAt + i * 14;
    if (at + 14 > bytes.length) break;
    const locator = dv.getUint32(at + 0x0a, true);
    entries.push({
      resref: fixedString(bytes, at, 8),
      type: dv.getUint16(at + 0x08, true),
      biff: locator >>> 20,
      fileIndex: locator & 0x3fff,
    });
  }
  return { biffs, entries };
}

// BIFF: the archives. The header gives the file table's place; the table gives each file's.

export const BIFF_HEADER_SIZE = 20;
export const BIFF_ENTRY_SIZE = 16;

export type BiffHeader = { fileCount: number; entriesAt: number };
export type BiffEntry = { fileIndex: number; offset: number; size: number; type: number };

export function readBiffHeader(bytes: Uint8Array): BiffHeader {
  expect(bytes, "BIFF", "V1");
  const dv = view(bytes);
  return { fileCount: dv.getUint32(0x08, true), entriesAt: dv.getUint32(0x10, true) };
}

/**
 * Parse a file table from exactly its bytes. Entries carry their own locator, matched against a KEY
 * entry's file index; they are not addressed by position.
 */
export function readBiffEntries(table: Uint8Array, fileCount: number): BiffEntry[] {
  const dv = view(table);
  const count = Math.min(fileCount, Math.floor(table.length / BIFF_ENTRY_SIZE));
  return Array.from({ length: count }, (_, i) => {
    const at = i * BIFF_ENTRY_SIZE;
    return {
      fileIndex: dv.getUint32(at + 0x00, true) & 0x3fff,
      offset: dv.getUint32(at + 0x04, true),
      size: dv.getUint32(at + 0x08, true),
      type: dv.getUint16(at + 0x0c, true),
    };
  });
}

// CRE: creatures.

/** The size of a CRE V1.0 header: it ends with the dialog resref at 0x2cc. */
export const CRE_HEADER_SIZE = 0x2d4;

/** The five saves at 0x54, in file order, named as the walker names them. */
export const CRE_SAVES = ["death", "wand", "poly", "breath", "spell"] as const;

/**
 * The eleven resistances at 0x59, in file order, named as the walker names them; `magic` is magic
 * resistance, which the walker reports as `mr`.
 */
export const CRE_RESISTANCES = [
  "fire",
  "cold",
  "electricity",
  "acid",
  "magic",
  "magic_fire",
  "magic_cold",
  "slashing",
  "crushing",
  "piercing",
  "missile",
] as const;

export type Creature = {
  resref: string;
  nameStrref: number;
  currentHp: number;
  maxHp: number;
  acNatural: number;
  acEffective: number;
  acCrushing: number;
  acMissile: number;
  acPiercing: number;
  acSlashing: number;
  thac0: number;
  dex: number;
  saves: Record<typeof CRE_SAVES[number], number>;
  resistances: Record<typeof CRE_RESISTANCES[number], number>;
  ea: number;
  itemCount: number;
  effectCount: number;
};

/**
 * Parse a CRE V1.0. AC and its modifiers are signed words; saves and resistances are signed bytes
 * (negative resistances occur), so they are read signed.
 */
export function readCre(resref: string, bytes: Uint8Array): Creature {
  expect(bytes, "CRE", "V1.0");
  if (bytes.length < CRE_HEADER_SIZE) throw new Error(`${resref}: CRE shorter than its header`);
  const dv = view(bytes);
  const saves = Object.fromEntries(CRE_SAVES.map((s, i) => [s, dv.getInt8(0x54 + i)]));
  const resistances = Object.fromEntries(
    CRE_RESISTANCES.map((r, i) => [r, dv.getInt8(0x59 + i)]),
  );
  return {
    resref,
    nameStrref: dv.getUint32(0x08, true),
    currentHp: dv.getUint16(0x24, true),
    maxHp: dv.getUint16(0x26, true),
    acNatural: dv.getInt16(0x46, true),
    acEffective: dv.getInt16(0x48, true),
    acCrushing: dv.getInt16(0x4a, true),
    acMissile: dv.getInt16(0x4c, true),
    acPiercing: dv.getInt16(0x4e, true),
    acSlashing: dv.getInt16(0x50, true),
    thac0: dv.getUint8(0x52),
    dex: dv.getUint8(0x23c),
    saves: saves as Creature["saves"],
    resistances: resistances as Creature["resistances"],
    ea: dv.getUint8(0x270),
    itemCount: dv.getUint32(0x2c0, true),
    effectCount: dv.getUint32(0x2c8, true),
  };
}

// 2DA: text tables. "2DA V1.0", a default value, the column names, then one row per line: a label
// and its values.

export type Table = { columns: string[]; rows: Map<string, string[]> };

export function read2da(bytes: Uint8Array): Table {
  const lines = ASCII.decode(bytes).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (lines[0]?.replace(/\s+/g, " ") !== "2DA V1.0") throw new Error("not a 2DA V1.0 file");
  const columns = (lines[2] ?? "").split(/\s+/);
  const rows = new Map(
    lines.slice(3).map((l) => {
      const [label, ...values] = l.split(/\s+/);
      return [label.toUpperCase(), values] as [string, string[]];
    }),
  );
  return { columns, rows };
}

/** A 2DA cell as a number, or null when the row or column is missing or the cell is not one. */
export function cell(table: Table, row: string, column: string): number | null {
  const at = table.columns.indexOf(column);
  const raw = at === -1 ? undefined : table.rows.get(row.toUpperCase())?.[at];
  return raw === undefined || !/^-?\d+$/.test(raw) ? null : Number(raw);
}
