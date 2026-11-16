import { deepStrictEqual, strictEqual } from "node:assert/strict";
import type { CreatureRecord } from "../../src/model/schemas.ts";
import {
  longestSeconds,
  type SpellFacts,
  spellProblems,
  spellSources,
  spellSummary,
} from "../../src/verify/spells.ts";

// The fake game's records, as the Lua API writes them (test/fixtures/a7xdata.txt).
const RECORDS: CreatureRecord[] = (await Deno.readTextFile("test/fixtures/a7xdata.txt"))
  .split("\n").filter((l) => l !== "").map((l) => JSON.parse(l.slice(l.indexOf("\t") + 1)));

// What the game files give for the fake game's two sources: Bless, 36 seconds at every level; the
// bard song's helper, 100 ticks, with no name.
const FACTS = new Map<string, SpellFacts>([
  ["SPPR101", { name: "Bless", longest: 36 }],
  ["FJBARDB", { name: "FJBARDB", longest: 7 }],
]);

Deno.test("a spell file's longest duration: seconds for mode 0, ticks rounded up for mode 10", () => {
  strictEqual(
    longestSeconds([
      { ability: 0, opcode: 142, timing: 0, duration: 36 },
      { ability: 0, opcode: 215, timing: 0, duration: 2 },
      { ability: null, opcode: 142, timing: 10, duration: 100 },
      { ability: null, opcode: 1, timing: 1, duration: 9999 },
    ]),
    36,
  );
  strictEqual(longestSeconds([{ ability: null, opcode: 142, timing: 10, duration: 100 }]), 7);
  strictEqual(longestSeconds([{ ability: 0, opcode: 1, timing: 9, duration: 0 }]), null);
});

Deno.test("the records' spells match the game files: names as given, times within the files", () => {
  deepStrictEqual(spellSources(RECORDS), ["FJBARDB", "SPPR101"]);
  deepStrictEqual(spellProblems(RECORDS, FACTS), []);
  deepStrictEqual(spellSummary(RECORDS), [
    "  Alarion: FJBARDB 7 s (FJBARDB), Bless 36 s (SPPR101)",
  ]);
});

Deno.test("a wrong name, a time past the file's longest plus one, or an unknown source fails", () => {
  const wrong = new Map(FACTS).set("SPPR101", { name: "Benediction", longest: 36 });
  deepStrictEqual(spellProblems(RECORDS, wrong), [
    'Alarion (329681): SPPR101 shows "Bless", the game files give "Benediction"',
  ]);
  const shorter = new Map(FACTS).set("SPPR101", { name: "Bless", longest: 34 });
  strictEqual(
    spellProblems(RECORDS, shorter)[0].endsWith("longer than its spell file's 34 s"),
    true,
  );
  const unknown = new Map(FACTS);
  unknown.delete("FJBARDB");
  deepStrictEqual(spellProblems(RECORDS, unknown), [
    "Alarion (329681): FJBARDB: nothing known of it",
  ]);
  const item = new Map(FACTS).set("SPPR101", { name: "Bless", longest: null });
  deepStrictEqual(spellProblems(RECORDS, item), [], "no duration in the file: not checked");
});
