/**
 * The src/ layout rules (docs/architecture.md, "Code organization"):
 *
 * - no files directly in src/, only concern folders;
 * - only src/tasks/ and the runner in src/shared/task.ts may exit the process or
 *   read arguments, so every library module is safe to import from a test;
 * - every task entry point goes through runTask(), which checks the Deno version;
 * - every `deno run` task in deno.json points at an entry point in src/tasks/.
 */
import { deepStrictEqual } from "node:assert/strict";
import { readRepoFile, walkRepo } from "../src/shared/repo_files.ts";

const { files } = await walkRepo();
const sources = files.filter((f) => f.startsWith("src/") && f.endsWith(".ts"));

Deno.test("src/ holds only folders, no loose files", () => {
  deepStrictEqual(files.filter((f) => /^src\/[^/]+$/.test(f)), []);
});

Deno.test("only src/tasks/ and the runner exit the process or read arguments", async () => {
  const offenders: string[] = [];
  for (const file of sources) {
    if (file.startsWith("src/tasks/") || file === "src/shared/task.ts") continue;
    const text = await readRepoFile(file);
    if (/Deno\.exit\(|Deno\.args|import\.meta\.main/.test(text)) offenders.push(file);
  }
  deepStrictEqual(offenders, []);
});

Deno.test("every task entry point runs through runTask()", async () => {
  const missing: string[] = [];
  for (const file of sources.filter((f) => f.startsWith("src/tasks/"))) {
    if (!(await readRepoFile(file)).includes("await runTask(")) missing.push(file);
  }
  deepStrictEqual(missing, []);
});

Deno.test("every deno run task points at src/tasks/", async () => {
  const tasks = JSON.parse(await readRepoFile("deno.json")).tasks as Record<string, string>;
  const wrong = Object.entries(tasks)
    .filter(([, command]) => command.includes("deno run"))
    .filter(([, command]) => !/\ssrc\/tasks\/[a-z0-9_]+\.ts(\s|$)/.test(command))
    .map(([name]) => name);
  deepStrictEqual(wrong, []);
});
