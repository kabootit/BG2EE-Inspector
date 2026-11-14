/**
 * `deno task verify [session-log]`: judge the party check in a session log (src/verify/checks.ts),
 * by default the newest logs/session-*.log. Prints every compared field of the latest run and exits
 * non-zero unless every party member was compared and every field agreed.
 */
import { offsetsHolding, parseChecks, parseDumps, problems } from "../verify/checks.ts";
import { runTask } from "../shared/task.ts";

async function newestLog(): Promise<string | undefined> {
  const names: string[] = [];
  for await (const e of Deno.readDir("logs")) {
    if (/^session-.*\.log$/.test(e.name)) names.push(e.name);
  }
  return names.sort().at(-1) && `logs/${names.sort().at(-1)}`;
}

await runTask(async () => {
  const path = Deno.args[0] ?? await newestLog();
  if (!path) {
    console.error("verify: no session log in logs/");
    return 1;
  }
  const log = await Deno.readTextFile(path);
  const runs = parseChecks(log);
  const run = runs.at(-1);
  console.log(
    `verify: ${path}, ${runs.length} run(s) of the check; judging run ${run?.run ?? "-"}`,
  );
  for (const m of run?.members ?? []) {
    if (m.skip) console.log(`  ${m.id}  skipped: ${m.skip}`);
    for (const f of m.fields) {
      console.log(
        `  ${m.id}  ${f.field.padEnd(16)} ${f.ok ? "ok  " : "DIFF"}  ${f.walker}  ${f.engine}`,
      );
    }
  }
  // A party member's EA is 2 (PC): offsets reading 2 in every member's sprite are where it may be.
  const dumps = run ? parseDumps(log, run.run) : [];
  if (dumps.length > 0) {
    const hits = offsetsHolding(dumps, 2).map((o) => `0x${o.toString(16)}`);
    console.log(
      `verify: offsets reading 2 in all ${dumps.length} sprite dumps: ${hits.join(" ") || "none"}`,
    );
  }
  const found = problems(run);
  if (found.length === 0) {
    const fields = run!.members.reduce((n, m) => n + m.fields.length, 0);
    console.log(`verify: passed, ${run!.members.length} members, ${fields} fields, all equal`);
    return 0;
  }
  for (const p of found) console.error(`verify: ${p}`);
  return 1;
});
