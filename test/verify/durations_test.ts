import { deepStrictEqual, strictEqual } from "node:assert/strict";
import type { SplEffect } from "../../src/gamefiles/iebinary.ts";
import type { EffectRun } from "../../src/model/schemas.ts";
import {
  allowedTicks,
  clockProblems,
  durationProblems,
  durationSummary,
  pausedProblems,
  rateChecks,
  REACTION,
  REMOVAL_LAG,
  removalProblems,
} from "../../src/verify/durations.ts";

const TIMED = 0x49f0;

/** An absolute effect on member `id`: from `source`, set at `applied`, expiring at `expiry`. */
const effect = (
  id: number,
  source: string,
  opcode: number,
  applied: number,
  expiry: number,
  p2 = 0,
) => ({
  run: 0,
  kind: "effect" as const,
  id,
  head: TIMED,
  index: 0,
  opcode,
  p1: 0,
  p2,
  timing: 4096,
  duration: expiry,
  applied,
  source,
});

// Haste on member 1, cast at 1000 for 108 seconds (+4 ticks, as the game sets it): its icon (38)
// and its haste effect (opcode 16).
const HASTE = [effect(1, "SPWI305", 142, 1000, 2624, 38), effect(1, "SPWI305", 16, 1000, 2624)];

// Enhanced Bard Song's icon (37), applied each round: the one in a run expires 90 ticks later.
const song = (at: number) => effect(1, "SPCL920A", 142, at, at + 90, 37);

/** A probe run at clock `time`, member 1 with `effects`. */
const run = (
  n: number,
  time: number | undefined,
  effects: ReturnType<typeof effect>[],
): EffectRun => ({
  run: n,
  size: 1,
  time,
  ticks: time === undefined ? undefined : time * 60,
  clock: n * 30000,
  members: [{ id: 1, lists: [], effects }],
});

// The test: two paused runs at 2000, then the run the moment Haste's icon went (expired at 2624).
const PASSING = [
  run(1, 2000, [...HASTE, song(1950)]),
  run(2, 2000, [...HASTE, song(1950)]),
  run(3, 2650, [song(2600)]),
];

const SPELLS = new Map<string, SplEffect[] | null>([
  [
    "SPWI305",
    [48, 54, 108].flatMap((d, ability) => [
      { ability, opcode: 142, timing: 0, duration: d },
      { ability, opcode: 16, timing: 0, duration: d },
    ]),
  ],
  ["SPCL920A", [{ ability: 0, opcode: 142, timing: 10, duration: 90 }]],
]);

Deno.test("a spell file allows 15 ticks a second of a mode-0 duration and a mode-10 duration as ticks", () => {
  const spell: SplEffect[] = [
    { ability: 0, opcode: 142, timing: 0, duration: 54 },
    { ability: 1, opcode: 142, timing: 0, duration: 48 },
    { ability: 1, opcode: 142, timing: 0, duration: 48 },
    { ability: null, opcode: 142, timing: 10, duration: 100 },
    { ability: null, opcode: 142, timing: 1, duration: 0 },
    { ability: 0, opcode: 16, timing: 0, duration: 60 },
  ];
  deepStrictEqual(allowedTicks(spell, 142), [100, 720, 810]);
  deepStrictEqual(allowedTicks(spell, 999), []);
});

Deno.test("the rate check: each distinct effect against its spell file, within a second", () => {
  const { checked, unchecked } = rateChecks(PASSING, SPELLS);
  deepStrictEqual(checked.map((c) => [c.effect.source, c.effect.opcode, c.lasted, c.ok]), [
    ["SPWI305", 142, 1624, true],
    ["SPWI305", 16, 1624, true],
    ["SPCL920A", 142, 90, true],
    ["SPCL920A", 142, 90, true],
  ]);
  deepStrictEqual(unchecked, []);
  const off = rateChecks([run(1, 2000, [effect(1, "SPWI305", 16, 1000, 2650)])], SPELLS);
  deepStrictEqual(off.checked.map((c) => c.ok), [false]);
  const item = rateChecks([run(1, 2000, [effect(1, "RING02", 1, 1000, 5000)])], SPELLS);
  deepStrictEqual([item.checked.length, item.unchecked.length], [0, 1]);
});

Deno.test("the clock: every run read it, and nothing was applied after it", () => {
  deepStrictEqual(clockProblems(PASSING), []);
  deepStrictEqual(clockProblems([run(1, undefined, [])]), ["run 1: no game clock"]);
  deepStrictEqual(clockProblems([run(1, 999, HASTE)]).length, 2);
});

Deno.test("paused: the two paused runs read the same time, the third a later one", () => {
  deepStrictEqual(pausedProblems(PASSING), []);
  deepStrictEqual(pausedProblems([PASSING[0], run(2, 2010, []), PASSING[2]]).length, 1);
  deepStrictEqual(pausedProblems([PASSING[0], PASSING[1], run(3, 2000, [])]).length, 1);
});

Deno.test("removal: an icon gone at its expiry passes; the bard song's refreshed icon is not gone", () => {
  deepStrictEqual(removalProblems(PASSING), []);
});

Deno.test("removal: an effect listed up to REMOVAL_LAG ticks past its expiry passes", () => {
  // As in the third Effect duration run: a 2-second visual effect one tick past its expiry, paused.
  const visual = effect(1, "SPWI305", 215, 1000, 1999);
  const lagging = [
    run(1, 2000, [...HASTE, visual]),
    run(2, 2000, [...HASTE, visual]),
    PASSING[2],
  ];
  deepStrictEqual(removalProblems(lagging), []);
  const stale = effect(1, "SPWI305", 215, 1000, 2000 - REMOVAL_LAG - 1);
  strictEqual(
    removalProblems([run(1, 2000, [...HASTE, stale]), run(2, 2000, [...HASTE, stale]), PASSING[2]])
      .length,
    2,
  );
  strictEqual(
    durationSummary(lagging, SPELLS, () => "").some((l) =>
      l.startsWith("  listed past their expiry: 2 effect(s), at most 1 ticks")
    ),
    true,
  );
});

Deno.test("removal: an expired effect still listed, one gone early, a late pause or no icon gone fail", () => {
  const listed = [PASSING[0], PASSING[1], run(3, 2650, [...HASTE, song(2600)])];
  strictEqual(
    removalProblems(listed).some((p) => p.includes("expired at 2624 but is listed")),
    true,
  );
  const early = [PASSING[0], PASSING[1], run(3, 2500, [song(2450)])];
  strictEqual(removalProblems(early).some((p) => p.includes("before its expiry")), true);
  const late = [PASSING[0], PASSING[1], run(3, 2624 + REACTION + 1, [song(2700)])];
  strictEqual(removalProblems(late).some((p) => p.includes(`more than ${REACTION}`)), true);
  const none = [PASSING[0], PASSING[1], run(3, 2100, [...HASTE, song(2050)])];
  deepStrictEqual(removalProblems(none), ["no icon went between runs 2 and 3"]);
});

Deno.test("the duration gate passes the test's three runs, and needs three", () => {
  deepStrictEqual(durationProblems(PASSING, SPELLS), []);
  deepStrictEqual(durationProblems(PASSING.slice(1), SPELLS), [
    "2 run(s) of the probe, the test needs 3",
  ]);
  deepStrictEqual(durationProblems(PASSING, new Map()), [
    "no effect could be checked against its spell file",
  ]);
});

Deno.test("the summary shows each run's clock, the real-time rate, the rates and the icon gone", () => {
  const lines = durationSummary(PASSING, SPELLS, (r) => r === "SPWI305" ? "Haste" : "");
  strictEqual(lines[0], "  run 1: clock 2000, Infinity_GetGameTicks 60.0 × it");
  strictEqual(
    lines[3],
    "  real time between runs 2 and 3: 30.0 s, 650 game ticks, 21.7 a second (pauses included)",
  );
  strictEqual(
    lines.some((l) =>
      l.endsWith(
        "SPWI305   Haste  opcode 16: lasted 1624 ticks (108.3 s), the file's nearest 108 s",
      )
    ),
    true,
  );
  strictEqual(
    lines.at(-1),
    "  icon 38 on 1 (SPWI305 Haste) went: expired at 2624, 26 ticks (1.7 s) before run 3",
  );
});
