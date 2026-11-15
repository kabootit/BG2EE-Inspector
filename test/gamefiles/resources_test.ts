import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readCre, RES_TYPE } from "../../src/gamefiles/iebinary.ts";
import {
  type Disk,
  openGameFiles,
  openStringTable,
  readCreature,
  readName,
  readSpellEffects,
} from "../../src/gamefiles/resources.ts";
import { GAME_DIR } from "../../src/shared/config.ts";
import { biffFile, creFile, keyFile } from "./fixtures.ts";

/** A game folder in memory: chitin.key, one archive, and optionally a patched file in override/. */
function fakeDisk(withOverride: boolean): Disk {
  const files = new Map<string, Uint8Array>();
  files.set(
    "/game/chitin.key",
    keyFile("data/Creature.bif", [
      { resref: "COWH", type: RES_TYPE.cre, fileIndex: 7 },
    ]),
  );
  files.set(
    "/game/data/Creature.bif",
    biffFile([{ fileIndex: 7, type: RES_TYPE.cre, bytes: creFile() }]),
  );
  if (withOverride) {
    const patched = creFile();
    new DataView(patched.buffer).setUint16(0x26, 99, true);
    files.set("/game/override/CowH.CRE", patched);
  }
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

Deno.test("a creature is read from its archive, by any case of its resref", async () => {
  const files = await openGameFiles("/game", fakeDisk(false));
  const found = await readCreature(files, "cowh");
  strictEqual(found?.source, "data/Creature.bif");
  strictEqual(readCre("COWH", found!.bytes).maxHp, 48);
  strictEqual(await readCreature(files, "NOSUCH"), null);
});

Deno.test("override/ comes before the archives, whatever the file name's case", async () => {
  const found = await readCreature(await openGameFiles("/game", fakeDisk(true)), "COWH");
  strictEqual(found?.source, "override");
  strictEqual(readCre("COWH", found!.bytes).maxHp, 99);
});

// The spawn check's fixtures, from the one place they are listed.
const FIXTURES = (await Deno.readTextFile("test/lua/a7xspawn.lua"))
  .match(/^local FIXTURES = \{ (.*) \}$/m)![1]
  .split(",").map((s) => s.trim().replace(/"/g, ""));

Deno.test("each spawn fixture is in the installed game, with no items and no effects", async () => {
  let files;
  try {
    files = await openGameFiles(GAME_DIR);
  } catch (error) {
    // Not installed on this machine. A permission error is not skipped, so the check cannot pass
    // without having run.
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  strictEqual(FIXTURES.length, 4, "fixtures listed");
  for (const resref of FIXTURES) {
    const found = await readCreature(files, resref);
    strictEqual(found === null, false, `${resref} is in the game`);
    const c = readCre(resref, found!.bytes);
    deepStrictEqual([resref, c.itemCount, c.effectCount], [resref, 0, 0]);
    strictEqual(c.acNatural, c.acEffective, `${resref}: one AC to compare with`);
  }
});

// Names the first effect probe run (2026-11-15) met, as the game shows them.
Deno.test("the installed game: spells and items by name, and helper spells without one", async () => {
  let files;
  try {
    files = await openGameFiles(GAME_DIR);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  const strings = await openStringTable(files);
  strictEqual(strings === null, false, "lang/en_US/dialog.tlk");
  const names: Record<string, string | null> = {};
  for (const resref of ["SPWI112", "SPCL920", "SPCL920A", "SPCL321", "RING39", "NOSUCH"]) {
    names[resref] = await readName(files, strings!, resref);
  }
  deepStrictEqual(names, {
    SPWI112: "Magic Missile",
    SPCL920: "Enhanced Bard Song",
    SPCL920A: null,
    SPCL321: "Enrage",
    RING39: "Ring of Gaxx",
    NOSUCH: null,
  });
});

// The durations the fourth Effect presence run (2026-11-15) fits at 15 game ticks a second.
Deno.test("the installed game: a spell's icon effect lasts longer with each ability level", async () => {
  let files;
  try {
    files = await openGameFiles(GAME_DIR);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  const icons = async (resref: string): Promise<number[]> =>
    ((await readSpellEffects(files, resref)) ?? [])
      .filter((e) => e.opcode === 142 && e.timing === 0).map((e) => e.duration);
  // Protection from Evil, 10' Radius: 1 turn a level from level 7; Haste: 6 seconds a level.
  deepStrictEqual((await icons("SPPR408")).slice(0, 3), [420, 480, 540]);
  strictEqual((await icons("SPPR408")).includes(1200), true);
  deepStrictEqual((await icons("SPWI305")).slice(0, 3), [48, 54, 60]);
  strictEqual((await icons("SPWI305")).includes(108), true);
  strictEqual(await readSpellEffects(files, "NOSUCH"), null);
});
