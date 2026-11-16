/**
 * `deno task verify [session-log]`: judge the checks in a session log, by default the newest
 * logs/session-*.log. Every line is JSON defined in src/model/schemas.ts; a line that does not match
 * its schema fails the run. The party check (src/verify/checks.ts): every compared field of its
 * latest run. The creature list check (src/verify/list.ts): every run, each with its area and
 * creatures. The spawn check (src/verify/spawn.ts): the run that spawned, each creature against its
 * .cre file, read from the installed game, and what later runs saw change. The effect probe
 * (src/verify/effects.ts): its latest run, every effect's fields where the effect layout puts them.
 * The Effect duration test (src/verify/durations.ts): the probe's last three runs, against the game
 * clock and the spell files, when the session has three. The INSPECTOR_DATA records I.show writes: every
 * one a schema-1 record, and their active spells against the game files (src/verify/spells.ts).
 * Exits non-zero unless the log holds at least one check and every run judged passed.
 */
import {
  type CheckRun,
  type CreatureRecord,
  type EffectRun,
  type ListRun,
  parseLines,
  RecordSchema,
  type SpawnRun,
} from "../model/schemas.ts";
import {
  longestSeconds,
  type SpellFacts,
  spellProblems,
  spellSources,
  spellSummary,
} from "../verify/spells.ts";
import { memberDump, offsetsHolding, parseChecks, problems } from "../verify/checks.ts";
import {
  durationProblems,
  durationSummary,
  TEST_RUNS,
  TICKS_PER_SECOND,
} from "../verify/durations.ts";
import { effectRunProblems, memberSummary, parseEffects } from "../verify/effects.ts";
import { listProblems, parseLists } from "../verify/list.ts";
import {
  changesSince,
  compareCreature,
  headerDifferences,
  judgedRun,
  parseSpawns,
  spawnProblems,
} from "../verify/spawn.ts";
import { cell, CRE_HEADER_SIZE, read2da, readCre, type SplEffect } from "../gamefiles/iebinary.ts";
import {
  openGameFiles,
  openStringTable,
  readCreature,
  readResource,
  readSpellEffects,
} from "../gamefiles/resources.ts";
import { nameRef } from "../gamefiles/names.ts";
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

/**
 * The name the game shows for each source of a run's effects, from the installed game's spell and
 * item files and dialog.tlk, a parent spell's shown as a guess (names.ts). Also the text of a strref, for the icons the record screen lists. Without the
 * game files every name and text is empty.
 */
async function sourceNames(
  runs: EffectRun[],
): Promise<{ nameOf: (resref: string) => string; textOf: (strref: number) => string }> {
  const files = await openGameFiles(GAME_DIR).catch(() => null);
  const strings = files && await openStringTable(files);
  const names = new Map<string, string>();
  if (!files || !strings) return { nameOf: () => "", textOf: () => "" };
  const sources = new Set(
    runs.flatMap((r) => r.members.flatMap((m) => m.effects.map((e) => e.source ?? ""))),
  );
  for (const source of [...sources].filter((s) => s !== "")) {
    const ref = await nameRef(files, strings, source);
    const name = ref && strings.get(ref.strref);
    names.set(source, name ? (ref!.guess ? `part of ${name}?` : name) : "(no name)");
  }
  return {
    nameOf: (resref: string): string => names.get(resref) ?? "",
    textOf: (strref: number): string => strings.get(strref) ?? "",
  };
}

/** The effect probe's latest run: each member's lists, effects and status icons; true when it passed. */
async function judgeEffects(runs: EffectRun[], path: string): Promise<boolean> {
  const run = runs.at(-1)!;
  console.log(
    `verify: ${path}, ${runs.length} run(s) of the effect probe; judging run ${run.run}` +
      ` (party ${run.size ?? "?"}, game ticks ${run.ticks ?? "?"})`,
  );
  const { nameOf, textOf } = await sourceNames([run]);
  for (const m of run.members) {
    console.log(`${m.id}${m.skip ? `  skipped: ${m.skip}` : ""}`);
    for (const line of memberSummary(m, nameOf, textOf)) console.log(line);
  }
  const found = effectRunProblems(run);
  if (found.length === 0) {
    const effects = run.members.reduce((n, m) => n + m.effects.length, 0);
    console.log(
      `verify: effect probe passed, ${run.members.length} members, ${effects} effects, every field plausible, ` +
        "every icon an opcode-142 effect shows listed by the record screen",
    );
    return true;
  }
  for (const p of found) console.error(`verify: effect probe: ${p}`);
  return false;
}

/** The spell file's effects for each source of `runs`' effects, null where there is no spell. */
async function spellEffects(runs: EffectRun[]): Promise<Map<string, SplEffect[] | null>> {
  const files = await openGameFiles(GAME_DIR).catch(() => null);
  const sources = new Set(
    runs.flatMap((r) => r.members.flatMap((m) => m.effects.map((e) => e.source ?? ""))),
  );
  const pairs = await Promise.all(
    [...sources].filter((s) => s !== "").map(async (s): Promise<[string, SplEffect[] | null]> => [
      s,
      files && await readSpellEffects(files, s),
    ]),
  );
  return new Map(pairs);
}

/**
 * The Effect duration test: the session's last three runs of the effect probe, judged by the
 * duration gate; true when it passed. With fewer runs it is not judged: an Effect presence session
 * has one.
 */
async function judgeDurations(runs: EffectRun[]): Promise<boolean> {
  const test = runs.slice(-TEST_RUNS);
  // A probe from before the clock (an Effect presence session) has nothing to summarize.
  if (test.at(-1)!.time !== undefined) {
    console.log(`verify: effect duration, runs ${test[0].run} to ${test.at(-1)!.run} of the probe`);
    const spells = await spellEffects(test);
    const { nameOf } = await sourceNames(test);
    for (const line of durationSummary(test, spells, nameOf)) console.log(line);
  }
  if (runs.length < TEST_RUNS) {
    console.log(
      `verify: effect duration not judged: ${runs.length} run(s) of the probe, the Effect duration test needs ${TEST_RUNS}`,
    );
    return true;
  }
  const spells = await spellEffects(test);
  const found = durationProblems(test, spells);
  if (found.length === 0) {
    console.log(
      `verify: effect duration passed: paused clock still, every checked effect set to last its spell file's duration at ${TICKS_PER_SECOND} ticks a second, each icon gone at its expiry`,
    );
    return true;
  }
  for (const p of found) console.error(`verify: effect duration: ${p}`);
  return false;
}

/**
 * What the installed game's files say of each source: its name (a nameless helper spell's parent's,
 * as the names table has it; the resref when there is none) and its spell file's longest duration;
 * null without the game files.
 */
async function spellFacts(resrefs: string[]): Promise<Map<string, SpellFacts> | null> {
  const files = await openGameFiles(GAME_DIR).catch(() => null);
  const strings = files && await openStringTable(files);
  if (!files || !strings) return null;
  const pairs = await Promise.all(resrefs.map(async (resref): Promise<[string, SpellFacts]> => {
    const ref = await nameRef(files, strings, resref);
    const spell = await readSpellEffects(files, resref);
    return [resref, {
      name: (ref && strings.get(ref.strref)) ?? resref,
      longest: spell && longestSeconds(spell),
    }];
  }));
  return new Map(pairs);
}

/**
 * The INSPECTOR_DATA records: every one a schema-1 record, and the active spells of those with any against
 * the game files; true when they passed.
 */
async function judgeData(
  records: CreatureRecord[],
  bad: string[],
  path: string,
): Promise<boolean> {
  console.log(`verify: ${path}, ${records.length + bad.length} INSPECTOR_DATA line(s)`);
  for (const r of records) {
    console.log(
      `  ${r.allegiance.side.padEnd(8)} ${String(r.id).padEnd(10)} hp ${
        `${r.hp.cur}/${r.hp.max}`.padEnd(8)
      } ${r.name}`,
    );
  }
  if (!noBadLines("INSPECTOR_DATA", bad)) return false;
  console.log(`verify: data passed, ${records.length} line(s), every one a schema-1 record`);
  const sources = spellSources(records);
  if (sources.length === 0) return true;
  for (const line of spellSummary(records)) console.log(line);
  const facts = await spellFacts(sources);
  if (!facts) {
    console.log("verify: spells not judged: the game files cannot be read");
    return true;
  }
  const found = spellProblems(records, facts);
  if (found.length === 0) {
    console.log(
      `verify: spells passed, ${sources.length} source(s), every name as the game files give it, every time within its spell file's duration`,
    );
    return true;
  }
  for (const p of found) console.error(`verify: spells: ${p}`);
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
  const effects = parseEffects(log);
  const data = parseLines(log, "INSPECTOR_DATA", RecordSchema);
  const lines = checks.runs.length + lists.runs.length + spawns.runs.length + effects.runs.length +
    data.count + checks.problems.length + lists.problems.length + spawns.problems.length +
    effects.problems.length;
  if (lines === 0) {
    console.error(
      `verify: ${path} has no INSPECTOR_CHECK, INSPECTOR_LIST, INSPECTOR_SPAWN, INSPECTOR_EFF or INSPECTOR_DATA lines`,
    );
    return 1;
  }
  // Every line must match its schema, whatever else is judged.
  let passed = noBadLines("INSPECTOR_CHECK", checks.problems);
  passed = noBadLines("INSPECTOR_LIST", lists.problems) && passed;
  passed = noBadLines("INSPECTOR_SPAWN", spawns.problems) && passed;
  passed = noBadLines("INSPECTOR_EFF", effects.problems) && passed;
  if (effects.runs.length > 0) passed = await judgeEffects(effects.runs, path) && passed;
  if (effects.runs.length > 0) passed = await judgeDurations(effects.runs) && passed;
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
  if (data.count > 0) passed = await judgeData(data.lines, data.problems, path) && passed;
  return passed ? 0 : 1;
});
