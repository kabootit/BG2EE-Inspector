/**
 * `deno task schema`: write docs/data-model.schema.json, the record's JSON Schema, from the Zod
 * schema in src/model/schemas.ts. Run after changing the schema; a test fails while the file is stale.
 */
import { recordJsonSchema } from "../model/schemas.ts";
import { runTask } from "../shared/task.ts";

const SCHEMA_FILE = "docs/data-model.schema.json";

await runTask(async () => {
  await Deno.writeTextFile(SCHEMA_FILE, JSON.stringify(recordJsonSchema(), null, 2) + "\n");
  console.log(`schema: wrote ${SCHEMA_FILE}`);
  return 0;
});
