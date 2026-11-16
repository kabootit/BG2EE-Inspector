import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  dumpBytes,
  memberDump,
  offsetsHolding,
  parseChecks,
  problems,
} from "../../src/verify/checks.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-14 19:01:32.541 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

// What test/lua/inspchk.lua writes for the fake game: member A compared, member B not populated.
const GOLDEN = (await Deno.readTextFile("test/fixtures/inspector_check.txt")).split("\n").filter((
  l,
) => l);
const LOG = ["Inspector registered Inspector_native at 0.5s, glClear call 1", ...GOLDEN.map(engine)]
  .join("\n");
const A = 329681, B = 395218;

Deno.test("the party check's lines fold into a run of members, fields and evidence", () => {
  const { runs, problems: bad } = parseChecks(LOG);
  deepStrictEqual(bad, []);
  deepStrictEqual(runs.map((r) => [r.run, r.size]), [[1, 2]]);
  const [a, b] = runs[0].members;
  deepStrictEqual([a.id, a.fields.length, a.fields.every((f) => f.ok)], [A, 20, true]);
  strictEqual(a.walk?.block, "derived");
  deepStrictEqual(a.dumps.map((d) => d.at), [0, 512, 1024, 1536]);
  strictEqual(memberDump(a).length, 2048);
  strictEqual(memberDump(a)[8], 0x31, "the sprite's type byte");
  deepStrictEqual([b.id, b.skip, b.fields.length], [B, "not-populated", 0]);
});

Deno.test("a skipped member, a difference or a missing member fails the run", () => {
  deepStrictEqual(problems(parseChecks(LOG).runs.at(-1)), [`${B}: skipped (not-populated)`]);
  const diff = LOG.replace(
    '{"engine":52,"field":"hp.max","id":329681,"kind":"field","ok":true',
    '{"engine":53,"field":"hp.max","id":329681,"kind":"field","ok":false',
  );
  strictEqual(
    problems(parseChecks(diff).runs.at(-1)).includes(`${A} hp.max: walker 52, engine 53`),
    true,
  );
  const missing = LOG.split("\n").filter((l) => !l.includes('"kind":"skip"')).join("\n");
  deepStrictEqual(problems(parseChecks(missing).runs.at(-1)), [
    "party of 2, but 1 members reported",
  ]);
});

Deno.test("a value the walker could not read is nil in the report", () => {
  const unread = engine(
    'INSPECTOR_CHECK\t{"field":"name","id":5,"kind":"field","ok":false,"run":1,"walker":"X"}',
  );
  const run =
    parseChecks([engine('INSPECTOR_CHECK\t{"kind":"party","run":1,"size":1}'), unread].join("\n"))
      .runs[0];
  deepStrictEqual(problems(run), ["5 name: walker X, engine nil"]);
});

Deno.test("an error line, or no lines, fails; the latest run is the one judged", () => {
  const error = parseChecks(
    engine('INSPECTOR_CHECK\t{"kind":"error","run":1,"why":"no game loaded"}'),
  );
  deepStrictEqual(problems(error.runs[0]), ["the check could not run: no game loaded"]);
  deepStrictEqual(problems(undefined), ["no INSPECTOR_CHECK lines in the log"]);
  const two = parseChecks(
    LOG + "\n" + engine('INSPECTOR_CHECK\t{"kind":"party","run":2,"size":0}'),
  );
  deepStrictEqual(two.runs.map((r) => r.run), [1, 2]);
  deepStrictEqual(problems(two.runs.at(-1)), []);
});

Deno.test("a line that does not match its schema is a problem naming the log line", () => {
  const { runs, problems: bad } = parseChecks(
    [
      engine('INSPECTOR_CHECK\t{"kind":"party","run":1,"size":2,"extra":1}'),
      engine("INSPECTOR_CHECK\t{oops}"),
    ]
      .join("\n"),
  );
  deepStrictEqual(runs, []);
  strictEqual(bad.length, 2);
  strictEqual(bad[0].startsWith("log line 1: "), true);
  strictEqual(bad[1], "log line 2: not JSON");
});

Deno.test("a missing dump chunk leaves its bytes unknown and the others at their offsets", () => {
  const [a] = parseChecks(LOG).runs[0].members;
  const gap = memberDump({ ...a, dumps: a.dumps.filter((d) => d.at !== 512) });
  strictEqual(gap.length, 2048);
  strictEqual(gap[600], null);
  strictEqual(gap[8], 0x31);
});

Deno.test("offsets holding a value in every dump are found; unreadable bytes hold nothing", () => {
  const dumps = ["0002??02", "0102??02"].map(dumpBytes);
  deepStrictEqual(dumps[0], [0, 2, null, 2]);
  deepStrictEqual(offsetsHolding(dumps, 2), [1, 3]);
  deepStrictEqual(offsetsHolding([], 2), []);
});
