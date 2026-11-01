/** `deno task doctor`: check every requirement in docs/requirements.md (src/setup/doctor.ts). */
import { doctorPassed, runDoctor, type Status } from "../setup/doctor.ts";
import { realSystem } from "../setup/system.ts";
import { runTask } from "../shared/task.ts";

const MARK: Record<Status, string> = { ok: "ok  ", warn: "warn", fail: "FAIL" };

await runTask(async () => {
  const checks = await runDoctor(realSystem);
  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    console.log(`  ${MARK[c.status]}  ${c.name.padEnd(width)}  ${c.detail}  [${c.audience}]`);
  }
  if (doctorPassed(checks)) {
    console.log("\ndoctor: every player requirement is met. See docs/requirements.md.");
    return 0;
  }
  console.error("\ndoctor: a player requirement is not met. See docs/requirements.md.");
  return 1;
});
