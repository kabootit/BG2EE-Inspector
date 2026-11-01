/** `deno task lint:docs`: the mechanical docs rules (src/lint/docs.ts). */
import { lintDocs, loadDocs } from "../lint/docs.ts";
import { runTask } from "../shared/task.ts";

await runTask(async () => {
  const { docs, files, dirs } = await loadDocs();
  const findings = lintDocs(docs, files, dirs);
  if (findings.length === 0) {
    console.log(`lint:docs  ${docs.length} markdown files, no findings`);
    return 0;
  }
  for (const f of findings) console.error(`  [${f.rule}] ${f.file}:${f.line}  ${f.detail}`);
  console.error(
    `\n${findings.length} docs finding(s). Rules: docs/rules/docs.md, docs/rules/writing-style.md`,
  );
  return 1;
});
