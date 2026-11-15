/**
 * Finding a game resource by name, the way the engine does: the game's `override/` folder first,
 * then the archives indexed by `chitin.key`. Mods patch by dropping files into `override/`, so the
 * archives alone would describe an unmodded game.
 *
 * Adapted from BG2EE-GameLog's `src/resources.ts` (same author): plain path joins instead of
 * `jsr:@std/path`, file access through a `Disk` so tests need no files, and only what reading a
 * creature needs. Reads only; an archive's file table is read once, and a resource is read by
 * seeking to it, never by loading a whole archive.
 */
import {
  BIFF_ENTRY_SIZE,
  BIFF_HEADER_SIZE,
  type BiffEntry,
  type KeyEntry,
  type KeyIndex,
  readBiffEntries,
  readBiffHeader,
  readKey,
  RES_TYPE,
} from "./iebinary.ts";

/** File access, as the readers need it. `realDisk` is the only one that touches files. */
export type Disk = {
  /** The whole file; throws Deno.errors.NotFound when there is none. */
  readFile(path: string): Promise<Uint8Array>;
  /** `length` bytes at `offset`, or null when the file is missing or shorter. */
  readAt(path: string, offset: number, length: number): Promise<Uint8Array | null>;
  /** The names of the files in a folder, or an empty list when there is no folder. */
  listDir(path: string): Promise<string[]>;
};

export const realDisk: Disk = {
  readFile: (path) => Deno.readFile(path),
  async readAt(path, offset, length): Promise<Uint8Array | null> {
    let file: Deno.FsFile;
    try {
      file = await Deno.open(path, { read: true });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return null;
      throw err;
    }
    try {
      await file.seek(offset, Deno.SeekMode.Start);
      const out = new Uint8Array(length);
      let got = 0;
      while (got < length) {
        const n = await file.read(out.subarray(got));
        if (n === null) return null;
        got += n;
      }
      return out;
    } finally {
      file.close();
    }
  },
  async listDir(path): Promise<string[]> {
    const names: string[] = [];
    try {
      for await (const e of Deno.readDir(path)) if (e.isFile) names.push(e.name);
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    return names;
  },
};

export type GameFiles = {
  gameDir: string;
  disk: Disk;
  key: KeyIndex;
  /** KEY entries by `<resref>.<type>`, lowercased: a resref alone is not unique across types. */
  byName: Map<string, KeyEntry>;
  /** `override/` file names by their lowercased name: one install mixes `.SPL` and `.spl`. */
  override: Map<string, string>;
  tables: Map<number, BiffEntry[] | null>;
};

export type Resource = { resref: string; bytes: Uint8Array; source: string };

/** Index the game's resources: `chitin.key` and the names in `override/`. */
export async function openGameFiles(gameDir: string, disk: Disk = realDisk): Promise<GameFiles> {
  const key = readKey(await disk.readFile(`${gameDir}/chitin.key`));
  const byName = new Map(key.entries.map((e) => [`${e.resref.toLowerCase()}.${e.type}`, e]));
  const names = await disk.listDir(`${gameDir}/override`);
  const override = new Map(names.map((n) => [n.toLowerCase(), n]));
  return { gameDir, disk, key, byName, override, tables: new Map() };
}

/** An archive's file table, read once. */
async function tableFor(files: GameFiles, biff: number): Promise<BiffEntry[] | null> {
  if (files.tables.has(biff)) return files.tables.get(biff)!;
  const name = files.key.biffs[biff];
  let table: BiffEntry[] | null = null;
  if (name !== undefined) {
    const path = `${files.gameDir}/${name}`;
    const head = await files.disk.readAt(path, 0, BIFF_HEADER_SIZE);
    if (head) {
      const { fileCount, entriesAt } = readBiffHeader(head);
      const bytes = await files.disk.readAt(path, entriesAt, fileCount * BIFF_ENTRY_SIZE);
      if (bytes) table = readBiffEntries(bytes, fileCount);
    }
  }
  files.tables.set(biff, table);
  return table;
}

/** A resource of a type in RES_TYPE: `override/` first, then the archives; null when there is none. */
export async function readResource(
  files: GameFiles,
  resref: string,
  type: keyof typeof RES_TYPE,
): Promise<Resource | null> {
  const loose = files.override.get(`${resref.toLowerCase()}.${type}`);
  if (loose !== undefined) {
    const bytes = await files.disk.readFile(`${files.gameDir}/override/${loose}`);
    return { resref, bytes, source: "override" };
  }
  const entry = files.byName.get(`${resref.toLowerCase()}.${RES_TYPE[type]}`);
  if (entry === undefined) return null;
  const file = (await tableFor(files, entry.biff))?.find((f) => f.fileIndex === entry.fileIndex);
  if (!file) return null;
  const archive = files.key.biffs[entry.biff];
  const bytes = await files.disk.readAt(`${files.gameDir}/${archive}`, file.offset, file.size);
  return bytes && { resref, bytes, source: archive };
}

/** A creature's file. */
export function readCreature(files: GameFiles, resref: string): Promise<Resource | null> {
  return readResource(files, resref, "cre");
}
