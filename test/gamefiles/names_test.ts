import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { RES_TYPE } from "../../src/gamefiles/iebinary.ts";
import {
  nameRef,
  namesLua,
  nameStrrefs,
  readName,
  spellAndItemResrefs,
} from "../../src/gamefiles/names.ts";
import { openGameFiles, openStringTable } from "../../src/gamefiles/resources.ts";
import { GAME_DIR } from "../../src/shared/config.ts";
import { biffFile, keyFile, memoryDisk, nameHeader, tlkFile } from "./fixtures.ts";

const STRINGS = [
  "<NO TEXT>",
  "Magic Missile",
  "Enhanced Bard Song",
  "Ring",
  "Ring of Gaxx",
  "Bless",
];

/**
 * A game with five spells and items in its archive, a name each way the game gives one, and a
 * patched Bless in override/, its file name in another case.
 */
async function game(): Promise<{
  files: Awaited<ReturnType<typeof openGameFiles>>;
  strings: NonNullable<Awaited<ReturnType<typeof openStringTable>>>;
}> {
  const archived = [
    { resref: "SPWI112", type: RES_TYPE.spl, bytes: nameHeader("SPL V1  ", 1, -1) },
    { resref: "SPCL920", type: RES_TYPE.spl, bytes: nameHeader("SPL V1  ", 2, -1) },
    { resref: "SPCL920A", type: RES_TYPE.spl, bytes: nameHeader("SPL V1  ", -1, -1) },
    { resref: "RING39", type: RES_TYPE.itm, bytes: nameHeader("ITM V1  ", 3, 4) },
    { resref: "NOTEXT", type: RES_TYPE.itm, bytes: nameHeader("ITM V1  ", 0, 0) },
  ].map((r, fileIndex) => ({ ...r, fileIndex }));
  const disk = memoryDisk(
    new Map([
      ["/game/chitin.key", keyFile("data/Spells.bif", archived)],
      ["/game/data/Spells.bif", biffFile(archived)],
      ["/game/lang/en_US/dialog.tlk", tlkFile(STRINGS)],
      ["/game/override/Sppr101.SPL", nameHeader("SPL V1  ", 5, -1)],
      ["/game/override/readme.txt", new Uint8Array()],
    ]),
  );
  const files = await openGameFiles("/game", disk);
  return { files, strings: (await openStringTable(files))! };
}

Deno.test("a name: a spell's unidentified one, an item's identified one, never <NO TEXT>", async () => {
  const { files, strings } = await game();
  strictEqual(await readName(files, strings, "SPWI112"), "Magic Missile");
  strictEqual(await readName(files, strings, "RING39"), "Ring of Gaxx");
  strictEqual(await readName(files, strings, "NOTEXT"), null);
  strictEqual(await readName(files, strings, "SPCL920A"), null);
  strictEqual(await readName(files, strings, "sppr101"), "Bless", "override/, any case");
});

Deno.test("a nameless spell takes its parent's name, marked as a guess", async () => {
  const { files, strings } = await game();
  deepStrictEqual(await nameRef(files, strings, "SPCL920A"), { strref: 2, guess: true });
  deepStrictEqual(await nameRef(files, strings, "SPCL920"), { strref: 2, guess: false });
  strictEqual(await nameRef(files, strings, "NOSUCH"), null);
});

Deno.test("the table holds every named spell and item from the archives and override/", async () => {
  const { files, strings } = await game();
  deepStrictEqual(spellAndItemResrefs(files), [
    "NOTEXT",
    "RING39",
    "SPCL920",
    "SPCL920A",
    "SPPR101",
    "SPWI112",
  ]);
  deepStrictEqual(
    [...await nameStrrefs(files, strings)],
    [["RING39", 4], ["SPCL920", 2], ["SPCL920A", 2], ["SPPR101", 5], ["SPWI112", 1]],
  );
});

Deno.test("the table as Lua: the INSPECTOR_NAMES global, one quoted resref a line, sorted", () => {
  const lua = namesLua(new Map([["SPWI112", 1], ['A"B\\', 7], ["RING39", 4], ["BADé", 9]]));
  const entries = lua.split("\n").filter((l) => l.startsWith("  ["));
  deepStrictEqual(entries, [
    '  ["A\\"B\\\\"] = 7,',
    '  ["RING39"] = 4,',
    '  ["SPWI112"] = 1,',
  ]);
  strictEqual(lua.includes("\nINSPECTOR_NAMES = {\n"), true);
  strictEqual(lua.endsWith("}\n"), true);
});

// Names the effect probe's runs (2026-11-15) met, as the game shows them.
Deno.test("the installed game: spells and items by name, and helper spells by their parent's", async () => {
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
  const table = await nameStrrefs(files, strings!);
  strictEqual(strings!.get(table.get("SPCL920A")!), "Enhanced Bard Song", "the parent's name");
  strictEqual(strings!.get(table.get("SPPR101")!), "Bless");
  strictEqual(table.has("FJBARDB"), false, "a source with no name, its parent's neither");
});
