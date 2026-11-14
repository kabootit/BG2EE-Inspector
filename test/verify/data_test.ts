import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { parseData } from "../../src/verify/data.ts";

// Lines as the engine logs them: Infinity_Log's text inside the engine's own line format.
const engine = (s: string) =>
  `2026-11-14 20:00:00.000 BaldursGateIIEnhancedEdition[1:2] INFO: LUA: ${s}`;

const GOLDEN = (await Deno.readTextFile("test/fixtures/a7xdata.txt")).split("\n").filter((l) => l);

Deno.test("A7XDATA lines inside engine log lines are parsed and checked", () => {
  const log = ["A7X loaded", ...GOLDEN.map(engine), engine("[A7X] not data")].join("\n");
  const data = parseData(log);
  strictEqual(data.lines, 3);
  deepStrictEqual(data.problems, []);
  deepStrictEqual(data.records.map((r) => r.name), ["Alarion", "Jaheira", "Ogre"]);
});

Deno.test("a line that is not JSON, or not a record, is a problem naming the log line", () => {
  const broken = GOLDEN[0].replace('"thac0":9', '"thac0":"nine"');
  const data = parseData([engine("A7XDATA\t{not json}"), engine(broken)].join("\r\n"));
  strictEqual(data.lines, 2);
  deepStrictEqual(data.problems.map((p) => p.split(":").slice(0, 2).join(":")), [
    "log line 1: not JSON",
    "log line 2: thac0",
  ]);
  strictEqual(data.records.length, 0);
});

Deno.test("a log without A7XDATA lines has none", () => {
  deepStrictEqual(parseData(engine("A7XCHECK 1 party 2")), { records: [], lines: 0, problems: [] });
});
