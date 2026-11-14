/**
 * Judging the party check from a session log.
 *
 * test/lua/a7xchk.lua writes A7XCHECK lines through Infinity_Log, which the engine prints inside
 * its own log lines (`… INFO: LUA: A7XCHECK 1 …`). This finds them anywhere in a line, keeps the
 * latest run (the check may be run several times in one session), and says whether it passed:
 * the party was found, every member was compared, and every compared field was ok.
 */

export type Field = { field: string; ok: boolean; walker: string; engine: string };
export type Member = { id: string; fields: Field[]; skip?: string };
export type Run = { run: number; party?: number; error?: string; members: Member[] };

const LINE = /A7XCHECK (\d+) (\S+) (.*)$/;
const FIELD = /^(\S+) (ok|DIFF) walker=(.*) \| engine=(.*)$/;

/** Every run of the check in a log, in run order. */
export function parseChecks(log: string): Run[] {
  const runs = new Map<number, Run>();
  for (const line of log.split("\n")) {
    const m = line.match(LINE);
    if (!m) continue;
    const n = Number(m[1]);
    const run = runs.get(n) ?? { run: n, members: [] };
    runs.set(n, run);
    const [, , who, rest] = m;
    if (who === "party") {
      if (rest.startsWith("error ")) run.error = rest.slice("error ".length);
      else run.party = Number(rest);
      continue;
    }
    let member = run.members.find((x) => x.id === who);
    if (!member) {
      member = { id: who, fields: [] };
      run.members.push(member);
    }
    if (rest.startsWith("skip ")) member.skip = rest.slice("skip ".length);
    const f = rest.match(FIELD);
    if (f) member.fields.push({ field: f[1], ok: f[2] === "ok", walker: f[3], engine: f[4] });
  }
  return [...runs.values()].sort((a, b) => a.run - b.run);
}

/** The A7XDUMP lines of one run: each party member's id and the bytes of its sprite. */
export function parseDumps(log: string, run: number): { id: string; bytes: (number | null)[] }[] {
  const out: { id: string; bytes: (number | null)[] }[] = [];
  for (const line of log.split("\n")) {
    const m = line.match(/A7XDUMP (\d+) (\S+) ([0-9a-f?]+)\s*$/);
    if (!m || Number(m[1]) !== run) continue;
    const bytes = (m[3].match(/../g) ?? []).map((h) => (h === "??" ? null : parseInt(h, 16)));
    out.push({ id: m[2], bytes });
  }
  return out;
}

/** Offsets at which every dump holds `value`: where a field all the creatures share may be. */
export function offsetsHolding(dumps: { bytes: (number | null)[] }[], value: number): number[] {
  if (dumps.length === 0) return [];
  const length = Math.min(...dumps.map((d) => d.bytes.length));
  return Array.from({ length }, (_, i) => i).filter((i) =>
    dumps.every((d) => d.bytes[i] === value)
  );
}

/** Why a run does not pass; empty when it does. */
export function problems(run: Run | undefined): string[] {
  if (!run) return ["no A7XCHECK lines in the log"];
  if (run.error) return [`the check could not run: ${run.error}`];
  if (run.party === undefined) return ["no party line"];
  const out: string[] = [];
  if (run.members.length !== run.party) {
    out.push(`party of ${run.party}, but ${run.members.length} members reported`);
  }
  for (const m of run.members) {
    if (m.skip) out.push(`${m.id}: skipped (${m.skip})`);
    else if (m.fields.length === 0) out.push(`${m.id}: no fields compared`);
    for (const f of m.fields.filter((f) => !f.ok)) {
      out.push(`${m.id} ${f.field}: walker ${f.walker}, engine ${f.engine}`);
    }
  }
  return out;
}
