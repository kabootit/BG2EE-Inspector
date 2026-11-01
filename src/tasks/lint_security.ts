/** `deno task lint:security`: the mechanical security invariants (src/lint/security.ts). */
import { audit } from "../lint/security.ts";
import { runTask } from "../shared/task.ts";

await runTask(async () => {
  const findings = await audit();
  if (findings.length === 0) {
    console.log("lint:security  all invariants hold. Judgment review: the security-audit skill");
    return 0;
  }
  for (const f of findings) console.error(`  [${f.check}] ${f.file}  ${f.detail}`);
  console.error(`\n${findings.length} security finding(s). Rules: docs/rules/security-first.md`);
  return 1;
});
