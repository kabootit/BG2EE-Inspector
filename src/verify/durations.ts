/**
 * Judging the Effect duration test (docs/manual-tests/durations.md) from the effect probe's runs.
 *
 * The test is the session's last three runs of test/lua/inspeff.lua: two with the game paused, the
 * tester waiting between them, then one taken the moment a spell's icon left a portrait. Each run's
 * party line holds the game's clock (`time`, CInfGame +0x3fa0); each effect with timing mode 4096
 * holds its expiry (`duration`) and the time it was applied (`applied`), both on that clock. The
 * checks, each a part of the time-remaining plan's duration gate:
 *
 * - the clock: every run read it, and no absolute effect was applied after it;
 * - paused: the two paused runs read the same time, and the third a later one;
 * - the rate: expiry minus applied is what the effect's spell file gives, at TICKS_PER_SECOND;
 * - removal: no run lists an effect more than REMOVAL_LAG ticks past its expiry, no effect left the
 *   list before its expiry, and an icon that went between the last two runs expired at most
 *   REACTION ticks before the last.
 */
import type { SplEffect } from "../gamefiles/iebinary.ts";
import type { EffectLine, EffectMember, EffectRun, Kind } from "../model/schemas.ts";
import { ICON_OPCODE } from "./effects.ts";

/** Game ticks in a second of game time: the foundation plan's value, which this gate checks. */
export const TICKS_PER_SECOND = 15;

/** How far expiry minus applied may be from a spell file's duration: one second. */
export const RATE_TOLERANCE = 15;

/** How long after an icon goes the tester may take to pause: ten seconds. */
export const REACTION = 10 * TICKS_PER_SECOND;

/**
 * How long past its expiry an effect may stay listed: one second. The third Effect duration run
 * found an effect still listed one tick past its expiry, while another creature's, expiring on the
 * same tick, was gone: the engine removes expired effects creature by creature. The countdown shows
 * whole seconds, so a lag under one second does not show.
 */
export const REMOVAL_LAG = TICKS_PER_SECOND;

/** Timing mode 4096: the duration field holds an absolute expiry time. */
export const ABSOLUTE = 4096;

/** The probe runs the test needs: paused, paused, after the icon went. */
export const TEST_RUNS = 3;

type Effect = Kind<EffectLine, "effect">;

/** An effect with an absolute expiry, with the member it is on. */
export type Timed = Effect & { duration: number; applied: number };

/** A member's effects with timing mode 4096 and both times read. */
const timed = (m: EffectMember): Timed[] =>
  m.effects.filter((e): e is Timed =>
    e.timing === ABSOLUTE && e.duration !== undefined && e.applied !== undefined
  );

/** The same effect in two runs: on the same member and list, from the same source, same times. */
const key = (e: Timed): string =>
  [e.id, e.head, e.source, e.opcode, e.p2, e.duration, e.applied].join(":");

/** One effect named for a reader: member, source, opcode, and its icon when it shows one. */
const label = (e: Timed): string =>
  `${e.id} ${e.source ?? "?"} opcode ${e.opcode}${
    e.opcode === ICON_OPCODE ? ` (icon ${e.p2})` : ""
  }`;

/**
 * What expiry minus applied may be, in game ticks, for an effect of `opcode` from `spell`: for each
 * of the spell's effects of that opcode, TICKS_PER_SECOND × its duration in timing mode 0 (seconds),
 * or its duration in timing mode 10 (ticks). Sorted, without repeats.
 */
export function allowedTicks(spell: SplEffect[], opcode: number): number[] {
  const ticks = spell.filter((s) => s.opcode === opcode && s.duration > 0)
    .flatMap((s) =>
      s.timing === 0 ? [s.duration * TICKS_PER_SECOND] : s.timing === 10 ? [s.duration] : []
    );
  return [...new Set(ticks)].sort((a, b) => a - b);
}

/** Game ticks as seconds, to a tenth, without a trailing ".0". */
const seconds = (ticks: number): string =>
  (ticks / TICKS_PER_SECOND).toFixed(1).replace(/\.0$/, "");

/** One rate check: an effect, how long it was set to last, and what its spell file allows. */
export type RateCheck = { effect: Timed; lasted: number; allowed: number[]; ok: boolean };

/**
 * The rate check for every distinct absolute effect in `runs`. An effect is checked when its source
 * is a spell in `spells` with an effect of the same opcode and a duration; the rest are unchecked
 * (items, abilities without a spell file, effects their spell file gives no duration).
 */
export function rateChecks(
  runs: EffectRun[],
  spells: Map<string, SplEffect[] | null>,
): { checked: RateCheck[]; unchecked: Timed[] } {
  const distinct = new Map(
    runs.flatMap((r) => r.members.flatMap(timed)).map((e): [string, Timed] => [key(e), e]),
  );
  const all = [...distinct.values()].map((effect) => {
    const spell = spells.get(effect.source ?? "") ?? [];
    const allowed = allowedTicks(spell, effect.opcode ?? -1);
    const lasted = effect.duration - effect.applied;
    return {
      effect,
      lasted,
      allowed,
      ok: allowed.some((t) => Math.abs(lasted - t) <= RATE_TOLERANCE),
    };
  });
  return {
    checked: all.filter((c) => c.allowed.length > 0),
    unchecked: all.filter((c) => c.allowed.length === 0).map((c) => c.effect),
  };
}

/** The clock: every run read it, and no absolute effect was applied after it. */
export function clockProblems(runs: EffectRun[]): string[] {
  return runs.flatMap((r) =>
    r.time === undefined ? [`run ${r.run}: no game clock`] : r.members.flatMap(timed)
      .filter((e) => e.applied > r.time!)
      .map((e) => `run ${r.run}: ${label(e)} applied at ${e.applied}, after the clock's ${r.time}`)
  );
}

/** Paused: the first two of the test's runs read the same time, and the third a later one. */
export function pausedProblems([first, second, third]: EffectRun[]): string[] {
  const out: string[] = [];
  if (first.time !== second.time) {
    out.push(
      `runs ${first.run} and ${second.run}, both paused, read ${first.time} and ${second.time}`,
    );
  }
  if ((third.time ?? 0) <= (second.time ?? 0)) {
    out.push(
      `run ${third.run} read ${third.time}, not later than run ${second.run}'s ${second.time}`,
    );
  }
  return out;
}

/** The icons a run's members show, as "member:icon". */
const icons = (run: EffectRun): Set<string> =>
  new Set(
    run.members.flatMap((m) =>
      m.effects.filter((e) => e.opcode === ICON_OPCODE).map((e) => `${m.id}:${e.p2}`)
    ),
  );

/** The effects `run` lists past their expiry. */
const pastExpiry = (run: EffectRun): Timed[] =>
  run.members.flatMap(timed).filter((e) => e.duration < (run.time ?? 0));

/** The effects in `before` that `after` no longer lists. */
export function ended(before: EffectRun, after: EffectRun): Timed[] {
  const still = new Set(after.members.flatMap(timed).map(key));
  return before.members.flatMap(timed).filter((e) => !still.has(key(e)));
}

/** The icon effects that ended between `before` and `after` whose icon `after` no longer shows. */
export function iconsGone(before: EffectRun, after: EffectRun): Timed[] {
  const shown = icons(after);
  return ended(before, after).filter((e) =>
    e.opcode === ICON_OPCODE && !shown.has(`${e.id}:${e.p2}`)
  );
}

/**
 * Removal: no run lists an effect more than REMOVAL_LAG ticks past its expiry; every effect that
 * left the list between the last two runs had reached its expiry; and at least one icon went, each
 * no more than REACTION ticks before the last run, so the countdown reached zero when the icon left.
 */
export function removalProblems(runs: EffectRun[]): string[] {
  const listed = runs.flatMap((r) =>
    pastExpiry(r).filter((e) => (r.time ?? 0) - e.duration > REMOVAL_LAG).map((e) =>
      `run ${r.run}: ${label(e)} expired at ${e.duration} but is listed at ${r.time}, ` +
      `more than ${REMOVAL_LAG} ticks later`
    )
  );
  const [before, after] = runs.slice(-2);
  const now = after.time ?? 0;
  const early = ended(before, after).filter((e) => e.duration > now).map((e) =>
    `${label(e)} left the list before run ${after.run} (${now}), ${
      e.duration - now
    } ticks before its expiry`
  );
  const gone = iconsGone(before, after);
  const late = gone.filter((e) => now - e.duration > REACTION).map((e) =>
    `${label(e)} expired at ${e.duration}, ${
      now - e.duration
    } ticks before run ${after.run}: more than ${REACTION}`
  );
  const none = gone.length === 0
    ? [`no icon went between runs ${before.run} and ${after.run}`]
    : [];
  return [...listed, ...early, ...late, ...none];
}

/** Why the session's last TEST_RUNS runs do not pass the duration gate; empty when they do. */
export function durationProblems(
  runs: EffectRun[],
  spells: Map<string, SplEffect[] | null>,
): string[] {
  if (runs.length < TEST_RUNS) {
    return [`${runs.length} run(s) of the probe, the test needs ${TEST_RUNS}`];
  }
  const test = runs.slice(-TEST_RUNS);
  const clock = clockProblems(test);
  if (clock.length > 0) return clock;
  const { checked } = rateChecks(test, spells);
  return [
    ...pausedProblems(test),
    ...checked.filter((c) => !c.ok).map((c) =>
      `${label(c.effect)}: set to last ${c.lasted} ticks; its spell file allows ${
        c.allowed.join(", ")
      }`
    ),
    ...(checked.length === 0 ? ["no effect could be checked against its spell file"] : []),
    ...removalProblems(test),
  ];
}

/**
 * The test's runs in a few lines: each run's clock (and Infinity_GetGameTicks as a multiple of
 * it), the real-time rate between the last two, the rate checks grouped by source and opcode, and
 * the icons that went with how long before the last run they expired.
 */
export function durationSummary(
  runs: EffectRun[],
  spells: Map<string, SplEffect[] | null>,
  nameOf: (resref: string) => string,
): string[] {
  const test = runs.slice(-TEST_RUNS);
  const out = test.map((r) =>
    `  run ${r.run}: clock ${r.time ?? "unread"}` +
    (r.time && r.ticks ? `, Infinity_GetGameTicks ${(r.ticks / r.time).toFixed(1)} × it` : "")
  );
  const [before, after] = test.slice(-2);
  if (before?.clock !== undefined && after?.clock !== undefined && after.clock > before.clock) {
    const real = (after.clock - before.clock) / 1000;
    const ticks = (after.time ?? 0) - (before.time ?? 0);
    out.push(
      `  real time between runs ${before.run} and ${after.run}: ${real.toFixed(1)} s, ` +
        `${ticks} game ticks, ${(ticks / real).toFixed(1)} a second (pauses included)`,
    );
  }
  const { checked, unchecked } = rateChecks(test, spells);
  const groups = Map.groupBy(checked, (c) => `${c.effect.source}:${c.effect.opcode}`);
  out.push(
    `  rate: ${checked.length} effects checked against their spell files, ${unchecked.length} unchecked`,
  );
  for (const group of groups.values()) {
    const { effect, allowed } = group[0];
    const lasted = [...new Set(group.map((c) => c.lasted))].sort((a, b) => a - b);
    // Each length with the spell file's duration nearest it.
    const nearest = lasted.map((t) =>
      allowed.reduce((best, a) => Math.abs(a - t) < Math.abs(best - t) ? a : best)
    );
    const bad = group.filter((c) => !c.ok).length;
    out.push(
      `    ${(effect.source ?? "").padEnd(8)}  ${
        nameOf(effect.source ?? "")
      }  opcode ${effect.opcode}: ` +
        `lasted ${lasted.join(", ")} ticks (${lasted.map(seconds).join(", ")} s), ` +
        `the file's nearest ${nearest.map(seconds).join(", ")} s` +
        (bad > 0 ? `; ${bad} more than ${RATE_TOLERANCE} ticks off` : ""),
    );
  }
  const lags = test.flatMap((r) => pastExpiry(r).map((e) => (r.time ?? 0) - e.duration));
  if (lags.length > 0) {
    out.push(
      `  listed past their expiry: ${lags.length} effect(s), at most ${
        Math.max(...lags)
      } ticks (the engine removes them creature by creature)`,
    );
  }
  if (before && after) {
    const now = after.time ?? 0;
    for (const e of iconsGone(before, after)) {
      out.push(
        `  icon ${e.p2} on ${e.id} (${e.source} ${
          nameOf(e.source ?? "")
        }) went: expired at ${e.duration}, ` +
          `${now - e.duration} ticks (${
            ((now - e.duration) / TICKS_PER_SECOND).toFixed(1)
          } s) before run ${after.run}`,
      );
    }
  }
  return out;
}
