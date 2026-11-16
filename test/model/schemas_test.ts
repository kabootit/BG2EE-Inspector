import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  CheckLine,
  EffectLine,
  ListLine,
  parseLines,
  parseRecord,
  recordJsonSchema,
  RecordSchema,
  SpawnLine,
} from "../../src/model/schemas.ts";

// The INSPECTOR_DATA lines the Lua API writes for the fake game (test/lua/inspapi_test.lua checks the Lua
// side against the same file), as JSON values.
const GOLDEN = (await Deno.readTextFile("test/fixtures/inspector_data.txt"))
  .split("\n").filter((l) => l !== "").map((l) => JSON.parse(l.slice(l.indexOf("\t") + 1)));

function problems(json: unknown): string[] {
  const parsed = parseRecord(json);
  return "problems" in parsed ? parsed.problems : [];
}

Deno.test("every record the Lua API writes is a schema-1 record", () => {
  strictEqual(GOLDEN.length, 3);
  for (const json of GOLDEN) deepStrictEqual(problems(json), []);
  const first = parseRecord(GOLDEN[0]);
  strictEqual("record" in first && first.record.allegiance.side, "party");
});

Deno.test("effects is optional; each entry needs a resref, a name and whole seconds, nothing else", () => {
  const record = () => structuredClone(GOLDEN[0]);
  const without = record();
  delete without.effects;
  deepStrictEqual(problems(without), [], "a record without effects, as before Phase 5");
  const negative = record();
  negative.effects[0].seconds = -1;
  deepStrictEqual(problems(negative).map((p) => p.split(":")[0]), ["effects.0.seconds"]);
  const extra = record();
  extra.effects[1].ticks = 540;
  deepStrictEqual(problems(extra).map((p) => p.split(":")[0]), ["effects.1"]);
  const noResref = record();
  noResref.effects[0].resref = "";
  deepStrictEqual(problems(noResref).map((p) => p.split(":")[0]), ["effects.0.resref"]);
});

Deno.test("an unknown, missing or mistyped field fails, naming the field", () => {
  const record = () => structuredClone(GOLDEN[0]);
  const unknown = { ...record(), spells: [] };
  strictEqual(problems(unknown).length, 1);
  const missing = record();
  delete missing.hp;
  deepStrictEqual(problems(missing).map((p) => p.split(":")[0]), ["hp"]);
  const mistyped = record();
  mistyped.saves.death = "4";
  deepStrictEqual(problems(mistyped).map((p) => p.split(":")[0]), ["saves.death"]);
  const fraction = record();
  fraction.ac = -2.5;
  deepStrictEqual(problems(fraction).map((p) => p.split(":")[0]), ["ac"]);
  const side = record();
  side.allegiance.side = "friend";
  deepStrictEqual(problems(side).map((p) => p.split(":")[0]), ["allegiance.side"]);
  const nested = record();
  nested.resist.holy = 0;
  strictEqual(problems(nested).length, 1);
});

Deno.test("another schema version is refused", () => {
  deepStrictEqual(problems({ ...GOLDEN[0], schema: 2 }).map((p) => p.split(":")[0]), ["schema"]);
  strictEqual(problems("not a record").length > 0, true);
});

Deno.test("docs/data-model.schema.json is the Zod schema as generated (deno task schema)", async () => {
  const file = JSON.parse(await Deno.readTextFile("docs/data-model.schema.json"));
  deepStrictEqual(file, recordJsonSchema());
});

// Every golden file: what the Lua writes for the fake game, one file per prefix. The Lua tests
// require the scripts to write exactly these lines; these tests require each to pass its schema.
const engine = (s: string) =>
  `2026-11-14 20:00:00.000 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;
const fixture = async (name: string) =>
  (await Deno.readTextFile(`test/fixtures/${name}`)).split("\n").filter((l) => l).map(engine)
    .join("\n");

Deno.test("every line of every golden file passes its schema", async () => {
  const passes = (
    file: string,
    parsed: { count: number; lines: unknown[]; problems: string[] },
  ) => [file, parsed.count, parsed.lines.length, parsed.problems];
  const check = parseLines(await fixture("inspector_check.txt"), "INSPECTOR_CHECK", CheckLine);
  deepStrictEqual(passes("inspector_check.txt", check), ["inspector_check.txt", 27, 27, []]);
  const list = parseLines(await fixture("inspector_list.txt"), "INSPECTOR_LIST", ListLine);
  deepStrictEqual(passes("inspector_list.txt", list), ["inspector_list.txt", 12, 12, []]);
  const spawn = parseLines(await fixture("inspector_spawn.txt"), "INSPECTOR_SPAWN", SpawnLine);
  deepStrictEqual(passes("inspector_spawn.txt", spawn), ["inspector_spawn.txt", 6, 6, []]);
  const effects = parseLines(await fixture("inspector_eff.txt"), "INSPECTOR_EFF", EffectLine);
  deepStrictEqual(passes("inspector_eff.txt", effects), ["inspector_eff.txt", 10, 10, []]);
  const data = parseLines(await fixture("inspector_data.txt"), "INSPECTOR_DATA", RecordSchema);
  deepStrictEqual(passes("inspector_data.txt", data), ["inspector_data.txt", 3, 3, []]);
});

Deno.test("a check line of an unknown kind, or with a field too many or too few, fails", () => {
  const bad = (json: string) =>
    parseLines(engine(`INSPECTOR_LIST\t${json}`), "INSPECTOR_LIST", ListLine);
  strictEqual(bad('{"kind":"party","run":1,"size":2}').problems.length, 1); // not a list kind
  strictEqual(
    bad('{"index":0,"kind":"area","resref":"AR0602","run":1,"extra":1}').problems.length,
    1,
  );
  strictEqual(bad('{"index":0,"kind":"area","run":1}').problems.length, 1);
  strictEqual(bad('{"index":"0","kind":"area","resref":"AR0602","run":1}').problems.length, 1);
});

Deno.test("a line the game's log cut short is reported, not skipped", () => {
  // As the log cut every party-check dump on 2026-11-14: the JSON stops mid-string.
  const cut = engine('INSPECTOR_CHECK\t{"hex":"703edd000100000031110000');
  const parsed = parseLines(cut, "INSPECTOR_CHECK", CheckLine);
  deepStrictEqual([parsed.count, parsed.problems], [1, ["log line 1: not JSON"]]);
});

Deno.test("parseLines finds lines inside engine log lines and names a broken one", () => {
  const log = [
    "Inspector loaded",
    engine('INSPECTOR_CHECK\t{"kind":"party","run":1,"size":1}'),
    engine("INSPECTOR_CHECK\t{not json}"),
    engine('INSPECTOR_CHECK\t{"kind":"party","run":1}'),
    engine("[Inspector] text for the message window"),
  ].join("\r\n");
  const parsed = parseLines(log, "INSPECTOR_CHECK", CheckLine);
  strictEqual(parsed.count, 3);
  deepStrictEqual(parsed.lines, [{ kind: "party", run: 1, size: 1 }]);
  strictEqual(parsed.problems[0], "log line 3: not JSON");
  strictEqual(parsed.problems[1].startsWith("log line 4: size: "), true);
  deepStrictEqual(parseLines("nothing here", "INSPECTOR_CHECK", CheckLine), {
    lines: [],
    count: 0,
    problems: [],
  });
});
