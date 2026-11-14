/**
 * Judging the creature list check from a session log.
 *
 * test/lua/a7xlist.lua writes A7XLIST lines, each a JSON object defined in src/model/schemas.ts
 * (ListLine). This folds them into runs and keeps every run: the manual test runs the check in two
 * areas, and each run is judged on its own. A run passes when it named the area on screen, made its
 * checks, and every check was ok.
 */
import { exhaustive, ListLine, type ListRun, parseLines } from "../model/schemas.ts";

/** Every run of the list check in a log, in run order, and the lines that are not ListLines. */
export function parseLists(log: string): { runs: ListRun[]; problems: string[] } {
  const parsed = parseLines(log, "A7XLIST", ListLine);
  const runs = new Map<number, ListRun>();
  for (const line of parsed.lines) {
    const run: ListRun = runs.get(line.run) ?? { run: line.run, creatures: [], checks: [] };
    runs.set(line.run, run);
    switch (line.kind) {
      case "area":
        run.area = line;
        break;
      case "scan":
        run.scan = line;
        break;
      case "creature":
        run.creatures.push(line);
        break;
      case "check":
        run.checks.push(line);
        break;
      case "error":
        run.error = line.why;
        break;
      default:
        exhaustive(line);
    }
  }
  return { runs: [...runs.values()].sort((a, b) => a.run - b.run), problems: parsed.problems };
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
