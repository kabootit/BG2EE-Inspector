/**
 * Judging the party check from a session log.
 *
 * test/lua/a7xchk.lua writes A7XCHECK lines, each a JSON object defined in src/model/schemas.ts
 * (CheckLine). This folds them into runs, keeps the latest (the check may be run several times in
 * one session), and says whether it passed: the party was found, every member was compared, and
 * every compared field was ok.
 */
import {
  CheckLine,
  type CheckMember,
  type CheckRun,
  exhaustive,
  parseLines,
} from "../model/schemas.ts";

/** Every run of the check in a log, in run order, and the lines that are not CheckLines. */
export function parseChecks(log: string): { runs: CheckRun[]; problems: string[] } {
  const parsed = parseLines(log, "A7XCHECK", CheckLine);
  const runs = new Map<number, CheckRun>();
  const member = (run: CheckRun, id: number): CheckMember => {
    let m = run.members.find((x) => x.id === id);
    if (!m) run.members.push(m = { id, fields: [], dumps: [] });
    return m;
  };
  for (const line of parsed.lines) {
    const run = runs.get(line.run) ?? { run: line.run, members: [] };
    runs.set(line.run, run);
    switch (line.kind) {
      case "party":
        run.size = line.size;
        break;
      case "error":
        run.error = line.why;
        break;
      case "field":
        member(run, line.id).fields.push(line);
        break;
      case "skip":
        member(run, line.id).skip = line.why;
        break;
      case "walk":
        member(run, line.id).walk = line;
        break;
      case "dump":
        member(run, line.id).dumps.push(line);
        break;
      default:
        exhaustive(line);
    }
  }
  return { runs: [...runs.values()].sort((a, b) => a.run - b.run), problems: parsed.problems };
}

/** A dump's bytes: a number each, or null where its block could not be read ("??"). */
export function dumpBytes(hex: string): (number | null)[] {
  return (hex.match(/../g) ?? []).map((h) => (h === "??" ? null : parseInt(h, 16)));
}

/**
 * A member's sprite dump from its chunks, each placed at its offset; bytes of a chunk that is
 * missing stay null, so the offsets of the others are never shifted.
 */
export function memberDump(m: CheckMember): (number | null)[] {
  const out: (number | null)[] = [];
  for (const chunk of m.dumps) {
    dumpBytes(chunk.hex).forEach((b, i) => out[chunk.at + i] = b);
  }
  return Array.from(out, (b) => b ?? null);
}

/** Offsets at which every dump holds `value`: where a field all the creatures share may be. */
export function offsetsHolding(dumps: (number | null)[][], value: number): number[] {
  if (dumps.length === 0) return [];
  const length = Math.min(...dumps.map((d) => d.length));
  return Array.from({ length }, (_, i) => i).filter((i) => dumps.every((d) => d[i] === value));
}

/** Why a run does not pass; empty when it does. */
export function problems(run: CheckRun | undefined): string[] {
  if (!run) return ["no A7XCHECK lines in the log"];
  if (run.error) return [`the check could not run: ${run.error}`];
  if (run.size === undefined) return ["no party line"];
  const out: string[] = [];
  if (run.members.length !== run.size) {
    out.push(`party of ${run.size}, but ${run.members.length} members reported`);
  }
  for (const m of run.members) {
    if (m.skip) out.push(`${m.id}: skipped (${m.skip})`);
    else if (m.fields.length === 0) out.push(`${m.id}: no fields compared`);
    for (const f of m.fields.filter((f) => !f.ok)) {
      out.push(`${m.id} ${f.field}: walker ${f.walker ?? "nil"}, engine ${f.engine ?? "nil"}`);
    }
  }
  return out;
}
