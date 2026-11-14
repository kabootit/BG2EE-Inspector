import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { parseRecord, recordJsonSchema } from "../../src/model/schema.ts";

// The A7XDATA lines the Lua API writes for the fake game (test/lua/a7xapi_test.lua checks the Lua
// side against the same file), as JSON values.
const GOLDEN = (await Deno.readTextFile("test/fixtures/a7xdata.txt"))
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
