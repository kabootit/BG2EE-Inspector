/**
 * `deno task verify [session-log]`: judge the checks in a session log, by default the newest
 * logs/session-*.log. The party check (src/verify/checks.ts): every compared field of its latest
 * run. The creature list check (src/verify/list.ts): every run, each with its area and creatures.
 * Exits non-zero unless the log holds at least one of them and every run judged passed.
 */
import { offsetsHolding, parseChecks, parseDumps, problems } from "../verify/checks.ts";
import { listProblems, type ListRun, parseLists } from "../verify/list.ts";
import { runTask } from "../shared/task.ts";

async function newestLog(): Promise<string | undefined> {
  const names: string[] = [];
  for await (const e of Deno.readDir("logs")) {
    if (/^session-.*\.log$/.test(e.name)) names.push(e.name);
  }
  return names.sort().at(-1) && `logs/${names.sort().at(-1)}`;
}

/** The party check's latest run; true when it passed. */
function judgeParty(log: string, path: string): boolean {
  const runs = parseChecks(log);
  const run = runs.at(-1);
  console.log(
    `verify: ${path}, ${runs.length} run(s) of the party check; judging run ${run?.run ?? "-"}`,
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
    return true;
  }
  for (const p of found) console.error(`verify: ${p}`);
  return false;
}

/** One run of the creature list check; true when it passed. */
function judgeList(run: ListRun): boolean {
  const area = run.area ? `${run.area.resref} (index ${run.area.index})` : "no area";
  console.log(`verify: creature list run ${run.run} in ${area}, ${run.creatures.length} creatures`);
  if (run.scan) console.log(`  scan ${run.scan}`);
  for (const c of run.creatures) {
    console.log(
      `  ${c.id}  ${c.group.padEnd(8)} ${c.party ? "party" : "     "}  ea ${c.ea.padEnd(3)}  ` +
        `hp ${c.hp.padEnd(7)}  ${c.name}`,
    );
  }
  for (const c of run.checks) {
    console.log(`  check ${c.name.padEnd(22)} ${c.ok ? "ok  " : "DIFF"}  ${c.detail}`);
  }
  const found = listProblems(run);
  if (found.length === 0) {
    console.log(`verify: creature list run ${run.run} passed, ${run.checks.length} checks ok`);
    return true;
  }
  for (const p of found) console.error(`verify: creature list run ${run.run}: ${p}`);
  return false;
}

await runTask(async () => {
  const path = Deno.args[0] ?? await newestLog();
  if (!path) {
    console.error("verify: no session log in logs/");
    return 1;
  }
  const log = await Deno.readTextFile(path);
  const party = parseChecks(log).length > 0;
  const lists = parseLists(log);
  if (!party && lists.length === 0) {
    console.error(`verify: ${path} has no A7XCHECK or A7XLIST lines`);
    return 1;
  }
  let passed = true;
  if (party) passed = judgeParty(log, path) && passed;
  if (lists.length > 0) console.log(`verify: ${path}, ${lists.length} run(s) of the creature list`);
  for (const run of lists) passed = judgeList(run) && passed;
  if (lists.length > 1) {
    console.log(
      `verify: creature list areas, in run order: ${
        lists.map((r) => r.area?.resref ?? "-").join(", ")
      }`,
    );
  }
  return passed ? 0 : 1;
});
