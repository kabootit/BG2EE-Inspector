import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  effectProblems,
  effectRunProblems,
  memberSummary,
  parseEffects,
} from "../../src/verify/effects.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string): string =>
  `2026-11-15 10:00:00.000 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// What test/lua/a7xeff.lua writes for the fake game: A with three effects on two lists, B with none.
const GOLDEN = (await Deno.readTextFile("test/fixtures/a7xeff.txt")).split("\n").filter((l) => l);
const LOG = GOLDEN.map(engine).join("\n");

Deno.test("the probe's lines fold into a run of members, each with its lists, effects and icons", () => {
  const { runs, problems } = parseEffects(LOG);
  deepStrictEqual(problems, []);
  strictEqual(runs.length, 1);
  const [a, b] = runs[0].members;
  deepStrictEqual([runs[0].size, runs[0].ticks], [2, 54000]);
  deepStrictEqual(a.lists.map((l) => [l.head, l.count]), [[0x49a0, 1], [0x49f0, 2]]);
  deepStrictEqual(a.effects.map((e) => [e.opcode, e.source]), [
    [1, "RING02"],
    [142, "SPPR101"],
    [0, "SPPR101"],
  ]);
  deepStrictEqual(a.status?.entries, ["1: icon=38;text=Bless"]);
  deepStrictEqual([b.lists.length, b.effects.length], [2, 0]);
  deepStrictEqual(effectRunProblems(runs[0]), []);
});

Deno.test("fields that do not look like an effect's are named: a wrong layout would read those", () => {
  const effect = parseEffects(LOG).runs[0].members[0].effects[0];
  deepStrictEqual(effectProblems(effect), []);
  const wrong = { ...effect, opcode: 70000, timing: 77, source: "\u0001\u0002" };
  deepStrictEqual(effectProblems(wrong).map((p) => p.split(": ")[1].split(" ")[0]), [
    "opcode",
    "timing",
    "source",
  ]);
  strictEqual(effectProblems({ ...effect, timing: 4096 }).length, 0, "absolute duration is a mode");
});

Deno.test("a member's summary groups each list by source, with names, timing, icons and the status", () => {
  const [a] = parseEffects(LOG).runs[0].members;
  const names: Record<string, string> = { RING02: "Batalista's Passport", SPPR101: "Bless" };
  deepStrictEqual(memberSummary(a, (r) => names[r] ?? ""), [
    "  +0x49a0 equipped: 1 effects from 1 sources",
    "    RING02    Batalista's Passport  1 effects  timing 2",
    "  +0x49f0 timed: 2 effects from 1 sources",
    "    SPPR101   Bless  2 effects  timing 0  icons 38",
    "  statusEffects: 1: icon=38;text=Bless",
    "  characters[id] keys: statusEffects",
  ]);
});

Deno.test("a list that stopped early, a missing list or a run that could not start fails", () => {
  const broken = LOG.replace(
    '"count":2,"head":18928',
    '"count":2,"head":18928,"why":"bad node pointer"',
  )
    .replace('{"capped":false,"count":0,"head":18848,"id":395218,"kind":"list","run":1}', "");
  const run = parseEffects(broken).runs[0];
  deepStrictEqual(effectRunProblems(run), [
    "329681 +0x49f0: bad node pointer",
    "395218: no list at +0x49a0",
  ]);
  const error = engine('A7XEFF\t{"kind":"error","run":1,"why":"no game loaded"}');
  deepStrictEqual(effectRunProblems(parseEffects(error).runs[0]), [
    "the probe could not run: no game loaded",
  ]);
});
