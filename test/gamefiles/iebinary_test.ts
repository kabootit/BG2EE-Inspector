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
  readSplEffects,
  readTlk,
  RES_TYPE,
} from "../../src/gamefiles/iebinary.ts";
import { biffFile, creFile, keyFile, nameHeader, tlkFile } from "./fixtures.ts";

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
  deepStrictEqual(readNameStrrefs(nameHeader("SPL V1  ", 1, -1), "spl"), {
    unidentified: 1,
    identified: -1,
  });
  deepStrictEqual(readNameStrrefs(nameHeader("ITM V1  ", 5, 6), "itm").identified, 6);
  throws(() => readNameStrrefs(nameHeader("ITM V1  ", 5, 6), "spl"), /not a SPL V1 file/);
});

/**
 * A spell file with one casting effect and two abilities, as IESDP lays it out: the header, the
 * abilities at 0x72, the effects after them. `effects` is [opcode, timing, duration] each; the
 * casting effect is the first, then `split` effects for ability 0 and the rest for ability 1.
 */
function splFile(effects: [number, number, number][], split: number): Uint8Array {
  const abilitiesAt = 0x72, effectsAt = abilitiesAt + 2 * 0x28;
  const bytes = new Uint8Array(effectsAt + effects.length * 0x30);
  const dv = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("SPL V1  "), 0);
  dv.setUint32(0x64, abilitiesAt, true);
  dv.setUint16(0x68, 2, true);
  dv.setUint32(0x6a, effectsAt, true);
  dv.setUint16(0x6e, 0, true); // casting effects: index 0, one of them
  dv.setUint16(0x70, 1, true);
  [[split, 1], [effects.length - 1 - split, 1 + split]].forEach(([count, first], a) => {
    dv.setUint16(abilitiesAt + a * 0x28 + 0x1e, count, true);
    dv.setUint16(abilitiesAt + a * 0x28 + 0x20, first, true);
  });
  effects.forEach(([opcode, timing, duration], i) => {
    dv.setUint16(effectsAt + i * 0x30, opcode, true);
    dv.setUint8(effectsAt + i * 0x30 + 0x0c, timing);
    dv.setUint32(effectsAt + i * 0x30 + 0x0e, duration, true);
  });
  return bytes;
}

Deno.test("a spell's effects: the casting effects, then each ability's, with their durations", () => {
  const spell = splFile([[215, 1, 0], [142, 0, 48], [16, 0, 48], [142, 0, 54]], 2);
  deepStrictEqual(readSplEffects(spell), [
    { ability: null, opcode: 215, timing: 1, duration: 0 },
    { ability: 0, opcode: 142, timing: 0, duration: 48 },
    { ability: 0, opcode: 16, timing: 0, duration: 48 },
    { ability: 1, opcode: 142, timing: 0, duration: 54 },
  ]);
});

Deno.test("a spell's effects past the end of its file are left out, and a short file has none", () => {
  const spell = splFile([[215, 1, 0], [142, 0, 48], [142, 0, 54]], 1);
  deepStrictEqual(readSplEffects(spell.subarray(0, spell.length - 0x30)).length, 2);
  deepStrictEqual(readSplEffects(spell.subarray(0, 0x40)), []);
  throws(() => readSplEffects(new TextEncoder().encode("ITM V1  ")), /not a SPL V1 file/);
});
