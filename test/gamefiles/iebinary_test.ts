import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import {
  BIFF_HEADER_SIZE,
  cell,
  read2da,
  readBiffEntries,
  readBiffHeader,
  readCre,
  readKey,
  RES_TYPE,
} from "../../src/gamefiles/iebinary.ts";
import { biffFile, creFile, keyFile } from "./fixtures.ts";

Deno.test("a KEY gives its archive paths and each resource's archive and file index", () => {
  const key = readKey(keyFile("data/Creature.bif", [
    { resref: "COWH", type: RES_TYPE.cre, fileIndex: 7 },
    { resref: "SHFIRE", type: RES_TYPE.cre, fileIndex: 3 },
  ]));
  deepStrictEqual(key.biffs, ["data/Creature.bif"]);
  deepStrictEqual(key.entries[1], { resref: "SHFIRE", type: 0x3f1, biff: 0, fileIndex: 3 });
});

Deno.test("a BIFF's table gives each file by its own locator, not its position", () => {
  const bytes = biffFile([
    { fileIndex: 3, type: RES_TYPE.cre, bytes: new Uint8Array([1, 2]) },
    { fileIndex: 7, type: RES_TYPE.cre, bytes: new Uint8Array([3, 4, 5]) },
  ]);
  const { fileCount, entriesAt } = readBiffHeader(bytes.subarray(0, BIFF_HEADER_SIZE));
  const table = readBiffEntries(bytes.subarray(entriesAt), fileCount);
  deepStrictEqual(table.map((e) => [e.fileIndex, e.size]), [[7, 3], [3, 2]]);
  const seven = table.find((e) => e.fileIndex === 7)!;
  deepStrictEqual([...bytes.subarray(seven.offset, seven.offset + seven.size)], [3, 4, 5]);
});

Deno.test("a CRE gives its stats, signed where IESDP has them signed", () => {
  const c = readCre("MUMFIG01", creFile());
  strictEqual(c.maxHp, 48);
  deepStrictEqual(
    [c.acNatural, c.acEffective, c.acCrushing, c.acMissile, c.acPiercing, c.acSlashing],
    [5, 4, -1, 2, 0, -3],
  );
  strictEqual(c.thac0, 17);
  strictEqual(c.dex, 18);
  deepStrictEqual(c.saves, { death: 13, wand: 15, poly: 14, breath: 16, spell: 16 });
  strictEqual(c.resistances.fire, -25);
  strictEqual(c.resistances.magic, 0);
  strictEqual(c.resistances.missile, 80);
  deepStrictEqual([c.ea, c.itemCount, c.effectCount], [128, 2, 3]);
});

Deno.test("a file of another kind or version, or a short CRE, is refused", () => {
  throws(() => readCre("X", keyFile("data/a.bif", [])), /not a CRE V1.0 file/);
  const v9 = creFile();
  v9.set(new TextEncoder().encode("V9.0"), 4);
  throws(() => readCre("X", v9), /not a CRE V1.0 file/);
  throws(() => readCre("X", creFile().subarray(0, 0x100)), /shorter than its header/);
  throws(() => readKey(creFile()), /not a KEY V1 file/);
});

Deno.test("a 2DA gives its cells by row label and column name", () => {
  // As DEXMOD.2DA is laid out: a default value line, then the column names, padded with spaces.
  const table = read2da(new TextEncoder().encode(
    "2DA V1.0\r\n0\r\n   REACTION  MISSILE   AC\r\n9    0        0        0\r\n18   2        2        -4\r\n",
  ));
  strictEqual(cell(table, "18", "AC"), -4);
  strictEqual(cell(table, "9", "MISSILE"), 0);
  strictEqual(cell(table, "30", "AC"), null);
  strictEqual(cell(table, "18", "SPEED"), null);
  throws(() => read2da(new TextEncoder().encode("CRE V1.0")), /not a 2DA V1.0 file/);
});
