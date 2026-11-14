import { deepStrictEqual } from "node:assert/strict";
import { RecordSchema } from "../../src/model/schemas.ts";

// docs/data-model.md's Fields table: each row's field name and, for a table, the keys in its Type
// column, written `{ a, b }`.
const spec = await Deno.readTextFile("docs/data-model.md");
const fields = spec.slice(spec.indexOf("## Fields"), spec.indexOf("## Example"))
  .split("\n")
  .map((row) => row.match(/^\| `([a-z0-9_]+)` \| ([^|]+) \|/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => ({ name: m[1], keys: m[2].match(/\{ ([a-z0-9_, ]+) \}/)?.[1].split(", ") ?? [] }));

/** The keys of a Zod object, or none for anything else. */
function keysOf(schema: unknown): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape).sort() : [];
}

Deno.test("docs/data-model.md lists exactly the schema's fields", () => {
  deepStrictEqual(fields.map((f) => f.name).sort(), keysOf(RecordSchema));
});

Deno.test("docs/data-model.md gives each table field the schema's keys", () => {
  for (const f of fields) {
    deepStrictEqual(
      [f.name, [...f.keys].sort()],
      [f.name, keysOf(RecordSchema.shape[f.name as keyof typeof RecordSchema.shape])],
    );
  }
});
