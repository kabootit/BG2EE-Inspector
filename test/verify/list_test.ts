import { deepStrictEqual } from "node:assert/strict";
import { listProblems, parseLists } from "../../src/verify/list.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-13 19:19:14.780 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// Two runs in two areas, as the manual test makes them; the second has a party member missing.
const LOG = [
  "A7X registered A7X_native at 0.4s, glClear call 1",
  engine("A7XLIST 1 area index=0 resref=AR0602"),
  engine("A7XLIST 1 scan slots=301 objects=5 sprites=4 listed=2 ms=0.4"),
  engine("A7XLIST 1 creature 327681 ea=2 group=friendly party=yes hp=40/52 state=0x0 name=Imoen"),
  engine(
    "A7XLIST 1 creature 19661011 ea=255 group=hostile party=no hp=60/60 state=0x0 name=Ogre Mage",
  ),
  engine("A7XLIST 1 check party.327681 ok listed"),
  engine("A7XLIST 1 check party.327681.group ok ea=2"),
  engine("A7XLIST 1 check unique ok repeated: none") + "\r",
  engine("A7XLIST 2 area index=1 resref=AR0603"),
  engine("A7XLIST 2 check party.327681 DIFF not in the list"),
  engine("A7XLIST 2 check unique ok repeated: none"),
].join("\n");

Deno.test("list runs are found inside engine log lines, with area, creatures and checks", () => {
  const runs = parseLists(LOG);
  deepStrictEqual(runs.map((r) => [r.run, r.area?.resref]), [[1, "AR0602"], [2, "AR0603"]]);
  deepStrictEqual(runs[0].scan, "slots=301 objects=5 sprites=4 listed=2 ms=0.4");
  deepStrictEqual(runs[0].creatures[1], {
    id: "19661011",
    ea: "255",
    group: "hostile",
    party: false,
    hp: "60/60",
    state: "0x0",
    name: "Ogre Mage",
  });
  deepStrictEqual(runs[0].checks.at(-1), { name: "unique", ok: true, detail: "repeated: none" });
});

Deno.test("a run with every check ok passes; a DIFF is named", () => {
  const [first, second] = parseLists(LOG);
  deepStrictEqual(listProblems(first), []);
  deepStrictEqual(listProblems(second), ["party.327681: not in the list"]);
});

Deno.test("an error, a missing area line or no party check fails the run", () => {
  deepStrictEqual(listProblems(parseLists(engine("A7XLIST 1 error no game loaded"))[0]), [
    "the check could not run: no game loaded",
  ]);
  deepStrictEqual(listProblems(parseLists(engine("A7XLIST 1 check unique ok repeated: none"))[0]), [
    "no area line",
    "no party member checked",
  ]);
});

Deno.test("a log without list lines has no runs", () => {
  deepStrictEqual(parseLists("A7X loaded\n" + engine("A7XCHECK 1 party 2")), []);
});
