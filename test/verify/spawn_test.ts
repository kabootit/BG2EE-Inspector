import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readCre } from "../../src/gamefiles/iebinary.ts";
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
  `2026-11-13 21:00:00.000 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// The values of test/gamefiles/fixtures.ts's creFile(), as the walker would log them.
const EQUAL = "resref=MUMFIG01 block=temp hp=30/48 ac=4,-1,2,0,-3 thac0=17 saves=13,15,14,16,16 " +
  "resist=-25,100,40,100,-25,100,50,50,50,80 mr=0 ea=128";

const LOG = [
  engine("A7XSPAWN 1 spawn MUMFIG01 ok "),
  engine("A7XSPAWN 1 spawn SHFIRE failed no such creature"),
  engine(`A7XSPAWN 1 creature 300 ${EQUAL}`),
  engine("A7XSPAWN 2 creature 300 " + EQUAL.replace("thac0=17", "thac0=15")),
  engine("A7XSPAWN 2 header 300 435245"),
].join("\n");

Deno.test("spawn runs are found inside engine log lines, with spawns, creatures and headers", () => {
  const runs = parseSpawns(LOG);
  deepStrictEqual(runs.map((r) => r.run), [1, 2]);
  deepStrictEqual(runs[0].spawned, [
    { resref: "MUMFIG01", ok: true, why: "" },
    { resref: "SHFIRE", ok: false, why: "no such creature" },
  ]);
  const c = runs[0].creatures[0];
  deepStrictEqual([c.id, c.resref, c.block, c.hp], ["300", "MUMFIG01", "temp", "30/48"]);
  strictEqual(c.values.get("resist.magic_fire"), "-25");
  strictEqual(c.values.get("mr"), "0");
  deepStrictEqual([...runs[1].headers.get("300")!], [0x43, 0x52, 0x45]);
});

Deno.test("a creature whose values equal its file compares equal in every field", () => {
  const cre = readCre("MUMFIG01", creFile());
  const fields = compareCreature(parseSpawns(LOG)[0].creatures[0], cre, 0);
  strictEqual(fields.length, 24); // max HP, 5 AC, THAC0, 5 saves, 10 resistances, MR, EA
  deepStrictEqual(fields.filter((f) => !f.ok), []);
});

Deno.test("a value that differs from the file is named with both values", () => {
  const cre = readCre("MUMFIG01", creFile());
  const diff = compareCreature(parseSpawns(LOG)[1].creatures[0], cre, 0).filter((f) => !f.ok);
  deepStrictEqual(diff, [{ field: "thac0", walker: "15", file: "17", ok: false }]);
});

Deno.test("a spawned fixture not found, an error, or no spawn at all fails the run", () => {
  const [first] = parseSpawns(LOG);
  deepStrictEqual(spawnProblems(first, ["MUMFIG01"]), []);
  deepStrictEqual(spawnProblems(first, ["MUMFIG01", "COWH"]), [
    "COWH: spawned but not found in run 1",
  ]);
  deepStrictEqual(spawnProblems(first, []), ["no fixture was spawned in this session"]);
  const failed = parseSpawns(engine("A7XSPAWN 1 error no console object C"))[0];
  deepStrictEqual(spawnProblems(failed, ["COWH"]), [
    "the check could not run: no console object C",
  ]);
});

Deno.test("header differences are the offsets where the engine's copy and the file disagree", () => {
  const file = creFile();
  const copy = file.slice();
  copy[0x24] = 0;
  copy[0x100] = 9;
  deepStrictEqual(headerDifferences(copy, file, file.length), [0x24, 0x100]);
});

Deno.test("the AC compared with the walker's is the file's plus the Dexterity adjustment", () => {
  // As the first run found: a file AC of 4 with DEX 18 (DEXMOD.2DA: -4) is an AC of 0 in the game.
  const cre = readCre("MUMFIG01", creFile());
  const walker =
    parseSpawns(engine(`A7XSPAWN 1 creature 300 ${EQUAL.replace("ac=4,", "ac=0,")}`))[0];
  const ac = compareCreature(walker.creatures[0], cre, -4).find((f) => f.field === "ac");
  deepStrictEqual(ac, { field: "ac", walker: "0", file: "0", ok: true });
});

Deno.test("the run that spawned is judged, and a later reading lists what changed since", () => {
  const runs = parseSpawns(
    LOG + "\n" + engine(
      "A7XSPAWN 3 creature 300 " +
        EQUAL.replace("hp=30/48", "hp=0/48").replace("ea=128", "ea=255"),
    ),
  );
  strictEqual(judgedRun(runs).run, 1);
  strictEqual(judgedRun(parseSpawns(engine(`A7XSPAWN 4 creature 300 ${EQUAL}`))).run, 4);
  deepStrictEqual(changesSince(runs[0].creatures[0], runs[2].creatures[0]), [
    "hp: 30/48 -> 0/48",
    "ea: 128 -> 255",
  ]);
  deepStrictEqual(changesSince(runs[0].creatures[0], runs[0].creatures[0]), []);
});
