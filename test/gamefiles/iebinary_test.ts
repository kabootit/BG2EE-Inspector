import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import {
  BIFF_HEADER_SIZE,
  cell,
  read2da,
  readBiffEntries,
  readBiffHeader,
  readCre,
  readKey,
  readNameStrrefs,
  readTlk,
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

/** A TLK V1 file of these strings, laid out as IESDP has it; an empty string has length 0. */
function tlkFile(strings: string[]): Uint8Array {
  const text = strings.map((s) => new TextEncoder().encode(s));
  const stringsAt = 18 + 26 * strings.length;
  const bytes = new Uint8Array(stringsAt + text.reduce((n, t) => n + t.length, 0));
  const dv = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("TLK V1  "), 0);
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

Deno.test("a TLK gives each string by its strref, and null for none, -1 or out of range", () => {
  const tlk = readTlk(tlkFile(["<NO TEXT>", "Magic Missile", "", "Blur"]));
  strictEqual(tlk.count, 4);
  strictEqual(tlk.get(1), "Magic Missile");
  strictEqual(tlk.get(3), "Blur");
  strictEqual(tlk.get(2), null);
  strictEqual(tlk.get(-1), null);
  strictEqual(tlk.get(4), null);
  throws(() => readTlk(new TextEncoder().encode("CRE V1.0")), /not a TLK V1 file/);
});

Deno.test("a spell's and an item's name strrefs are at 0x08 and 0x0c, -1 for none", () => {
  const header = (signature: string, unidentified: number, identified: number): Uint8Array => {
    const bytes = new Uint8Array(0x10);
    bytes.set(new TextEncoder().encode(signature), 0);
    new DataView(bytes.buffer).setInt32(0x08, unidentified, true);
    new DataView(bytes.buffer).setInt32(0x0c, identified, true);
    return bytes;
  };
  deepStrictEqual(readNameStrrefs(header("SPL V1  ", 1, -1), "spl"), {
    unidentified: 1,
    identified: -1,
  });
  deepStrictEqual(readNameStrrefs(header("ITM V1  ", 5, 6), "itm").identified, 6);
  throws(() => readNameStrrefs(header("ITM V1  ", 5, 6), "spl"), /not a SPL V1 file/);
});
