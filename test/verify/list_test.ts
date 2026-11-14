import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { listProblems, parseLists } from "../../src/verify/list.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-14 19:19:14.780 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// What test/lua/a7xlist.lua writes for the fake game: the area on screen and its three creatures.
const GOLDEN = (await Deno.readTextFile("test/fixtures/a7xlist.txt")).split("\n").filter((l) => l);
const LOG = GOLDEN.map(engine).join("\n");

Deno.test("the list's lines fold into a run with area, scan, creatures and checks", () => {
  const { runs, problems } = parseLists(LOG);
  deepStrictEqual(problems, []);
  strictEqual(runs.length, 1);
  const run = runs[0];
  deepStrictEqual([run.area?.resref, run.area?.index], ["AR0602", 0]);
  deepStrictEqual([run.scan?.slots, run.scan?.listed], [301, 3]);
  deepStrictEqual(run.creatures.map((c) => [c.name, c.group, c.party]), [
    ["Alarion", "friendly", true],
    ["Jaheira", "friendly", true],
    ["Ogre", "hostile", false],
  ]);
  strictEqual(run.checks.length, 7);
  deepStrictEqual(listProblems(run), []);
});

Deno.test("a check that is not ok is named; two runs are judged each on its own", () => {
  const second = LOG.replaceAll('"run":1', '"run":2').replace(
    '{"detail":"listed","kind":"check","name":"party.329681","ok":true',
    '{"detail":"not in the list","kind":"check","name":"party.329681","ok":false',
  );
  const { runs } = parseLists(LOG + "\n" + second);
  deepStrictEqual(runs.map((r) => r.run), [1, 2]);
  deepStrictEqual(listProblems(runs[0]), []);
  deepStrictEqual(listProblems(runs[1]), ["party.329681: not in the list"]);
});

Deno.test("an error, a missing area line or no party check fails the run", () => {
  const error = parseLists(engine('A7XLIST\t{"kind":"error","run":1,"why":"no game loaded"}'));
  deepStrictEqual(listProblems(error.runs[0]), ["the check could not run: no game loaded"]);
  const bare = parseLists(
    engine('A7XLIST\t{"detail":"repeated: none","kind":"check","name":"unique","ok":true,"run":1}'),
  );
  deepStrictEqual(listProblems(bare.runs[0]), ["no area line", "no party member checked"]);
});

Deno.test("a line that does not match its schema is a problem, not a run", () => {
  const { runs, problems } = parseLists(engine('A7XLIST\t{"kind":"creature","run":1,"id":"x"}'));
  deepStrictEqual(runs, []);
  strictEqual(problems.length > 0, true);
  deepStrictEqual(parseLists("A7X loaded"), { runs: [], problems: [] });
});
