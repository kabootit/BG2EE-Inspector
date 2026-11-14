/**
 * Judging the A7XDATA lines in a session log: the records A7X.show writes through Infinity_Log, one
 * JSON object per line after the tab (`… INFO: LUA: A7XDATA\t{…}`). Each must be a schema-1 record
 * (src/model/schema.ts); this is the contract check between the game's Lua and every tool outside it.
 */
import { type CreatureRecord, parseRecord } from "../model/schema.ts";

const LINE = /A7XDATA\s+(\{.*\})\s*$/;

export type DataResult = { records: CreatureRecord[]; lines: number; problems: string[] };

/** Every A7XDATA line in a log, each parsed and checked against the schema. */
export function parseData(log: string): DataResult {
  const out: DataResult = { records: [], lines: 0, problems: [] };
  log.split("\n").forEach((raw, i) => {
    const m = raw.trimEnd().match(LINE);
    if (!m) return;
    out.lines++;
    let json: unknown;
    try {
      json = JSON.parse(m[1]);
    } catch {
      out.problems.push(`log line ${i + 1}: not JSON`);
      return;
    }
    const parsed = parseRecord(json);
    if ("record" in parsed) out.records.push(parsed.record);
    else out.problems.push(...parsed.problems.map((p) => `log line ${i + 1}: ${p}`));
  });
  return out;
}
