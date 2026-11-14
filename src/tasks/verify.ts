/**
 * `deno task verify [session-log]`: judge the checks in a session log, by default the newest
 * logs/session-*.log. Every line is JSON defined in src/model/schemas.ts; a line that does not match
 * its schema fails the run. The party check (src/verify/checks.ts): every compared field of its
 * latest run. The creature list check (src/verify/list.ts): every run, each with its area and
 * creatures. The spawn check (src/verify/spawn.ts): the run that spawned, each creature against its
 * .cre file, read from the installed game, and what later runs saw change. The A7XDATA records
 * A7X.show writes: every one a schema-1 record. Exits non-zero unless the log holds at least one check
 * and every run judged passed.
 */
import {
  type CheckRun,
  type ListRun,
  parseLines,
  RecordSchema,
  type SpawnRun,
} from "../model/schemas.ts";
import { memberDump, offsetsHolding, parseChecks, problems } from "../verify/checks.ts";
import { listProblems, parseLists } from "../verify/list.ts";
import {
  changesSince,
  compareCreature,
  headerDifferences,
  judgedRun,
  parseSpawns,
  spawnProblems,
} from "../verify/spawn.ts";
import { cell, CRE_HEADER_SIZE, read2da, readCre } from "../gamefiles/iebinary.ts";
import { openGameFiles, readCreature, readResource } from "../gamefiles/resources.ts";
import { GAME_DIR } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

async function newestLog(): Promise<string | undefined> {
  const names: string[] = [];
  for await (const e of Deno.readDir("logs")) {
    if (/^session-.*\.log$/.test(e.name)) names.push(e.name);
  }
  return names.sort().at(-1) && `logs/${names.sort().at(-1)}`;
}

/** Lines of one prefix that did not match their schema; true when there were none. */
function noBadLines(prefix: string, found: string[]): boolean {
  for (const p of found) console.error(`verify: ${prefix}: ${p}`);
  return found.length === 0;
}

/** The party check's latest run; true when it passed. */
function judgeParty(runs: CheckRun[], path: string): boolean {
  const run = runs.at(-1);
  console.log(
    `verify: ${path}, ${runs.length} run(s) of the party check; judging run ${run?.run ?? "-"}`,
  );
  for (const m of run?.members ?? []) {
    if (m.skip) console.log(`  ${m.id}  skipped: ${m.skip}`);
    for (const f of m.fields) {
      console.log(
        `  ${m.id}  ${f.field.padEnd(16)} ${f.ok ? "ok  " : "DIFF"}  ${f.walker ?? "nil"}  ${
          f.engine ?? "nil"
        }`,
      );
    }
  }
  // A party member's EA is 2 (PC): offsets reading 2 in every member's sprite are where it may be.
  const dumps = (run?.members ?? []).filter((m) => m.dumps.length > 0).map(memberDump);
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
  if (run.scan) {
    const s = run.scan;
    console.log(
      `  scan slots=${s.slots} objects=${s.objects} sprites=${s.sprites} listed=${s.listed} ms=${
        s.ms ?? "-"
      }`,
    );
  }
  for (const c of run.creatures) {
    const hp = c.hp ? `${c.hp.cur ?? "?"}/${c.hp.max ?? "?"}` : "?";
    console.log(
      `  ${c.id}  ${(c.group ?? "?").padEnd(8)} ${c.party ? "party" : "     "}  ea ${
        String(c.ea ?? "?").padEnd(3)
      }  hp ${hp.padEnd(7)}  ${c.name ?? "(no name)"}`,
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

/** The spawn check's spawning run, against the game's .cre files; true when it passed. */
async function judgeSpawn(runs: SpawnRun[], path: string): Promise<boolean> {
  const run = judgedRun(runs);
  const spawned = [
    ...new Set(runs.flatMap((r) => r.spawned.filter((s) => s.ok).map((s) => s.resref))),
  ];
  console.log(
    `verify: ${path}, ${runs.length} run(s) of the spawn check; judging run ${run.run}`,
  );
  for (const s of runs.flatMap((r) => r.spawned)) {
    console.log(`  spawn ${s.resref.padEnd(8)} ${s.ok ? "ok" : `failed ${s.why ?? ""}`}`);
  }
  const found = spawnProblems(run, spawned);
  const files = await openGameFiles(GAME_DIR);
  const dexmod = await readResource(files, "DEXMOD", "2da");
  if (!dexmod) {
    console.error("verify: spawn check: no DEXMOD.2DA in the game");
    return false;
  }
  const dexTable = read2da(dexmod.bytes);
  let diffs = 0;
  for (const c of run.creatures) {
    const resource = await readCreature(files, c.resref);
    if (!resource) {
      found.push(`${c.resref}: no .cre file in the game`);
      continue;
    }
    const cre = readCre(c.resref, resource.bytes);
    const dexAc = cell(dexTable, String(cre.dex), "AC");
    if (dexAc === null) {
      found.push(`${c.resref}: DEXMOD.2DA has no AC for DEX ${cre.dex}`);
      continue;
    }
    console.log(
      `  ${c.id}  ${c.resref}  block=${c.block}  hp ${c.hp.cur}/${c.hp.max}  DEX ${cre.dex} ` +
        `(AC ${dexAc})  (file: ${resource.source})`,
    );
    for (const f of compareCreature(c, cre, dexAc)) {
      if (!f.ok) diffs++;
      console.log(`    ${f.field.padEnd(18)} ${f.ok ? "ok  " : "DIFF"}  ${f.walker}  ${f.file}`);
    }
    const header = run.headers.get(c.id);
    if (header) {
      const offsets = headerDifferences(header, resource.bytes, CRE_HEADER_SIZE);
      console.log(
        `    header differs from the file at ${offsets.length} of ${CRE_HEADER_SIZE} bytes: ${
          offsets.map((o) => `0x${o.toString(16)}`).join(" ") || "none"
        }`,
      );
    } else {
      console.log("    header: not logged or unreadable");
    }
  }
  if (diffs > 0) found.push(`${diffs} field(s) differ from the .cre files`);
  // Later readings are not judged: scripts and fights change creatures after they are spawned.
  for (const later of runs.filter((r) => r.run > run.run)) {
    console.log(`  run ${later.run}, changes since run ${run.run}:`);
    for (const c of later.creatures) {
      const first = run.creatures.find((x) => x.id === c.id);
      const changes = first ? changesSince(first, c) : ["not in the judged run"];
      console.log(`    ${c.id}  ${c.resref}  ${changes.join(", ") || "none"}`);
    }
  }
  if (found.length === 0) {
    console.log(
      `verify: spawn check passed, ${run.creatures.length} creatures, every field equal to its .cre`,
    );
    return true;
  }
  for (const p of found) console.error(`verify: spawn check: ${p}`);
  return false;
}

await runTask(async () => {
  const path = Deno.args[0] ?? await newestLog();
  if (!path) {
    console.error("verify: no session log in logs/");
    return 1;
  }
  const log = await Deno.readTextFile(path);
  const checks = parseChecks(log);
  const lists = parseLists(log);
  const spawns = parseSpawns(log);
  const data = parseLines(log, "A7XDATA", RecordSchema);
  const lines = checks.runs.length + lists.runs.length + spawns.runs.length + data.count +
    checks.problems.length + lists.problems.length + spawns.problems.length;
  if (lines === 0) {
    console.error(`verify: ${path} has no A7XCHECK, A7XLIST, A7XSPAWN or A7XDATA lines`);
    return 1;
  }
  // Every line must match its schema, whatever else is judged.
  let passed = noBadLines("A7XCHECK", checks.problems);
  passed = noBadLines("A7XLIST", lists.problems) && passed;
  passed = noBadLines("A7XSPAWN", spawns.problems) && passed;
  if (checks.runs.length > 0) passed = judgeParty(checks.runs, path) && passed;
  if (lists.runs.length > 0) {
    console.log(`verify: ${path}, ${lists.runs.length} run(s) of the creature list`);
  }
  for (const run of lists.runs) passed = judgeList(run) && passed;
  if (lists.runs.length > 1) {
    console.log(
      `verify: creature list areas, in run order: ${
        lists.runs.map((r) => r.area?.resref ?? "-").join(", ")
      }`,
    );
  }
  if (spawns.runs.length > 0) passed = await judgeSpawn(spawns.runs, path) && passed;
  if (data.count > 0) {
    console.log(`verify: ${path}, ${data.count} A7XDATA line(s)`);
    for (const r of data.lines) {
      console.log(
        `  ${r.allegiance.side.padEnd(8)} ${String(r.id).padEnd(10)} hp ${
          `${r.hp.cur}/${r.hp.max}`.padEnd(8)
        } ${r.name}`,
      );
    }
    if (noBadLines("A7XDATA", data.problems)) {
      console.log(`verify: data passed, ${data.count} line(s), every one a schema-1 record`);
    } else passed = false;
  }
  return passed ? 0 : 1;
});
