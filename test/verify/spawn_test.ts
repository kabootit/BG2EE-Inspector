import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readCre } from "../../src/gamefiles/iebinary.ts";
import type { SpawnCreature } from "../../src/model/schemas.ts";
import {
  changesSince,
  compareCreature,
  headerDifferences,
  judgedRun,
  parseSpawns,
  spawnProblems,
} from "../../src/verify/spawn.ts";
import { creFile } from "../gamefiles/fixtures.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-14 21:00:00.000 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// What test/lua/a7xspawn.lua writes for the fake game: four spawns, one fixture found, its header.
const GOLDEN = (await Deno.readTextFile("test/fixtures/a7xspawn.txt")).split("\n").filter((l) => l);
const LOG = GOLDEN.map(engine).join("\n");

// The values of test/gamefiles/fixtures.ts's creFile(), as the walker would read them.
const EQUAL: SpawnCreature = {
  run: 1,
  kind: "creature",
  id: 300,
  resref: "MUMFIG01",
  block: "temp",
  hp: { cur: 30, max: 48 },
  ac: { value: 4, crushing: -1, missile: 2, piercing: 0, slashing: -3 },
  thac0: 17,
  saves: { death: 13, wand: 15, poly: 14, breath: 16, spell: 16 },
  resist: {
    fire: -25,
    cold: 100,
    electricity: 40,
    acid: 100,
    magic_fire: -25,
    magic_cold: 100,
    slashing: 50,
    crushing: 50,
    piercing: 50,
    missile: 80,
  },
  mr: 0,
  ea: 128,
};

Deno.test("the spawn check's lines fold into a run with spawns, creatures and headers", () => {
  const { runs, problems } = parseSpawns(LOG);
  deepStrictEqual(problems, []);
  strictEqual(runs.length, 1);
  deepStrictEqual(runs[0].spawned.map((s) => [s.resref, s.ok]), [
    ["COWH", true],
    ["DRBOD", true],
    ["DADROW8", true],
    ["SHFIRE", true],
  ]);
  const c = runs[0].creatures[0];
  deepStrictEqual([c.resref, c.block, c.hp.max, c.ea], ["COWH", "derived", 60, 255]);
  strictEqual(runs[0].headers.get(c.id)?.length, 0x2d4);
});

Deno.test("a creature whose values equal its file compares equal in every field", () => {
  const fields = compareCreature(EQUAL, readCre("MUMFIG01", creFile()), 0);
  strictEqual(fields.length, 24); // max HP, 5 AC, THAC0, 5 saves, 10 resistances, MR, EA
  deepStrictEqual(fields.filter((f) => !f.ok), []);
});

Deno.test("a value that differs from the file is named with both values", () => {
  const diff = compareCreature({ ...EQUAL, thac0: 15 }, readCre("MUMFIG01", creFile()), 0)
    .filter((f) => !f.ok);
  deepStrictEqual(diff, [{ field: "thac0", walker: 15, file: 17, ok: false }]);
});

Deno.test("the AC compared with the walker's is the file's plus the Dexterity adjustment", () => {
  // As the first run found: a file AC of 4 with DEX 18 (DEXMOD.2DA: -4) is an AC of 0 in the game.
  const walker = { ...EQUAL, ac: { ...EQUAL.ac, value: 0 } };
  const ac = compareCreature(walker, readCre("MUMFIG01", creFile()), -4).find((f) =>
    f.field === "ac"
  );
  deepStrictEqual(ac, { field: "ac", walker: 0, file: 0, ok: true });
});

Deno.test("the run that spawned is judged; a later reading lists what changed since", () => {
  const later = LOG.replaceAll('"run":1', '"run":2').split("\n")
    .filter((l) => !l.includes('"kind":"spawn"')).join("\n")
    .replace('"hp":{"cur":60,"max":60}', '"hp":{"cur":0,"max":60}').replace('"ea":255', '"ea":128');
  const { runs } = parseSpawns(LOG + "\n" + later);
  strictEqual(judgedRun(runs).run, 1);
  deepStrictEqual(changesSince(runs[0].creatures[0], runs[1].creatures[0]), [
    "hp: 60/60 -> 0/60",
    "ea: 255 -> 128",
  ]);
  deepStrictEqual(changesSince(EQUAL, EQUAL), []);
});

Deno.test("a spawned fixture not found, an error, or no spawn at all fails the run", () => {
  const [run] = parseSpawns(LOG).runs;
  deepStrictEqual(spawnProblems(run, ["COWH"]), []);
  deepStrictEqual(spawnProblems(run, ["COWH", "DRBOD"]), ["DRBOD: spawned but not found in run 1"]);
  deepStrictEqual(spawnProblems(run, []), ["no fixture was spawned in this session"]);
  const failed = parseSpawns(
    engine('A7XSPAWN\t{"kind":"error","run":1,"why":"no console object C"}'),
  );
  deepStrictEqual(spawnProblems(failed.runs[0], ["COWH"]), [
    "the check could not run: no console object C",
  ]);
});

Deno.test("a creature line missing a field is a schema problem, not a creature", () => {
  const broken = LOG.replace('"mr":0,', "");
  const { runs, problems } = parseSpawns(broken);
  strictEqual(runs[0].creatures.length, 0);
  strictEqual(problems.some((p) => p.includes("mr")), true);
});

Deno.test("header differences are the offsets where the engine's copy and the file disagree", () => {
  const file = creFile();
  const copy = file.slice();
  copy[0x24] = 0;
  copy[0x100] = 9;
  deepStrictEqual(headerDifferences(copy, file, file.length), [0x24, 0x100]);
});
