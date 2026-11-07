import { deepStrictEqual } from "node:assert/strict";
import { parseChecks, problems } from "../../src/verify/checks.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-06 19:01:32.541 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

const PASSING = [
  "A7X registered A7X_native at 0.5s, glClear call 1",
  engine("A7XCHECK 1 party 1"),
  engine("A7XCHECK 1 327681 skip not-populated"),
  engine("A7XCHECK 2 party 2"),
  engine("A7XCHECK 2 327681 name ok walker=Imoen Sister | engine=Imoen Sister"),
  engine("A7XCHECK 2 327681 hp.cur ok walker=40 | engine=40"),
  engine("A7XWALK 2 327681 ea_a=2 ea_b=2 block=derived"),
  engine("A7XCHECK 2 393218 ac ok walker=-2 | engine=-2"),
].join("\n");

Deno.test("checks are found inside engine log lines, by run", () => {
  const runs = parseChecks(PASSING);
  deepStrictEqual(runs.map((r) => r.run), [1, 2]);
  deepStrictEqual(runs[1].members.map((m) => [m.id, m.fields.length]), [
    ["327681", 2],
    ["393218", 1],
  ]);
  deepStrictEqual(runs[1].members[0].fields[0], {
    field: "name",
    ok: true,
    walker: "Imoen Sister",
    engine: "Imoen Sister",
  });
});

Deno.test("the latest run passes when the whole party is compared and agrees", () => {
  deepStrictEqual(problems(parseChecks(PASSING).at(-1)), []);
  // The first run skipped a member, but only the latest is judged.
  deepStrictEqual(problems(parseChecks(PASSING)[0]), ["327681: skipped (not-populated)"]);
});

Deno.test("a difference, a skip, a missing member and an error each fail", () => {
  const diff = parseChecks(
    engine("A7XCHECK 1 party 1\n") +
      engine("A7XCHECK 1 5 hp.max DIFF walker=52 | engine=53"),
  );
  deepStrictEqual(problems(diff.at(-1)), ["5 hp.max: walker 52, engine 53"]);
  const missing = parseChecks(
    engine("A7XCHECK 1 party 2\n") + engine("A7XCHECK 1 5 ac ok walker=1 | engine=1"),
  );
  deepStrictEqual(problems(missing.at(-1)), ["party of 2, but 1 members reported"]);
  const error = parseChecks(engine("A7XCHECK 1 party error no game loaded"));
  deepStrictEqual(problems(error.at(-1)), ["the check could not run: no game loaded"]);
  deepStrictEqual(problems(parseChecks("nothing here").at(-1)), ["no A7XCHECK lines in the log"]);
});
