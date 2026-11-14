/**
 * Judging the creature list check from a session log.
 *
 * test/lua/a7xlist.lua writes A7XLIST lines through Infinity_Log, inside the engine's own log lines
 * (`… INFO: LUA: A7XLIST 1 …`). This finds them anywhere in a line and keeps every run: the manual
 * test runs the check in two areas, and each run is judged on its own. A run passes when it named
 * the area on screen, made its checks, and every check was ok.
 */

export type ListCheck = { name: string; ok: boolean; detail: string };
export type Creature = {
  id: string;
  ea: string;
  group: string;
  party: boolean;
  hp: string;
  state: string;
  name: string;
};
export type ListRun = {
  run: number;
  area?: { index: string; resref: string };
  scan?: string;
  creatures: Creature[];
  checks: ListCheck[];
  error?: string;
};

const LINE = /A7XLIST (\d+) (\S+) ?(.*)$/;
const AREA = /^index=(\S+) resref=(.*)$/;
const CREATURE = /^(\S+) ea=(\S+) group=(\S+) party=(yes|no) hp=(\S+) state=(\S+) name=(.*)$/;
const CHECK = /^(\S+) (ok|DIFF) ?(.*)$/;

/** Every run of the list check in a log, in run order. */
export function parseLists(log: string): ListRun[] {
  const runs = new Map<number, ListRun>();
  for (const raw of log.split("\n")) {
    const m = raw.trimEnd().match(LINE);
    if (!m) continue;
    const n = Number(m[1]);
    const run = runs.get(n) ?? { run: n, creatures: [], checks: [] };
    runs.set(n, run);
    const [, , kind, rest] = m;
    if (kind === "area") {
      const a = rest.match(AREA);
      if (a) run.area = { index: a[1], resref: a[2] };
    } else if (kind === "scan") {
      run.scan = rest;
    } else if (kind === "creature") {
      const c = rest.match(CREATURE);
      if (c) {
        run.creatures.push({
          id: c[1],
          ea: c[2],
          group: c[3],
          party: c[4] === "yes",
          hp: c[5],
          state: c[6],
          name: c[7],
        });
      }
    } else if (kind === "check") {
      const c = rest.match(CHECK);
      if (c) run.checks.push({ name: c[1], ok: c[2] === "ok", detail: c[3] });
    } else if (kind === "error") {
      run.error = rest;
    }
  }
  return [...runs.values()].sort((a, b) => a.run - b.run);
}

/** Why a run of the list check does not pass; empty when it does. */
export function listProblems(run: ListRun): string[] {
  if (run.error) return [`the check could not run: ${run.error}`];
  const out: string[] = [];
  if (!run.area) out.push("no area line");
  if (!run.checks.some((c) => c.name.startsWith("party."))) out.push("no party member checked");
  for (const c of run.checks.filter((c) => !c.ok)) out.push(`${c.name}: ${c.detail}`);
  return out;
}
