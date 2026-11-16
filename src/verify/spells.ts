/**
 * Judging the active spells in A7XDATA records (the record's optional `effects`, Phase 5 part 3)
 * against the game's files, for the Spell countdown test (docs/manual-tests/countdown.md):
 *
 * - each name is what the game files give for its resref, a nameless helper spell its parent's
 *   (src/gamefiles/names.ts), or the resref when they give none: that proves the names table
 *   install-mod wrote and `Infinity_FetchString` in the game;
 * - each time left is at most the spell file's longest duration, plus one second for rounding up.
 *   A source with no spell file (an item, such as a potion) or no duration is not checked.
 */
import type { SplEffect } from "../gamefiles/iebinary.ts";
import type { CreatureRecord } from "../model/schemas.ts";
import { TICKS_PER_SECOND } from "./durations.ts";

/** What the game files say of one source: the name the record must show, and its longest duration. */
export type SpellFacts = { name: string; longest: number | null };

/**
 * A spell file's longest duration in game seconds: timing mode 0 in seconds, mode 10 in ticks
 * (rounded up); null when it has neither.
 */
export function longestSeconds(spell: SplEffect[]): number | null {
  const seconds = spell.flatMap((s) =>
    s.timing === 0
      ? [s.duration]
      : s.timing === 10
      ? [Math.ceil(s.duration / TICKS_PER_SECOND)]
      : []
  ).filter((s) => s > 0);
  return seconds.length > 0 ? Math.max(...seconds) : null;
}

/** Every resref the records' effects name, sorted, without repeats. */
export function spellSources(records: CreatureRecord[]): string[] {
  return [...new Set(records.flatMap((r) => (r.effects ?? []).map((e) => e.resref)))].sort();
}

/** Why the records' effects do not match the game files; empty when they do. */
export function spellProblems(
  records: CreatureRecord[],
  facts: Map<string, SpellFacts>,
): string[] {
  return records.flatMap((r) =>
    (r.effects ?? []).flatMap((e) => {
      const known = facts.get(e.resref);
      if (!known) return [`${r.name} (${r.id}): ${e.resref}: nothing known of it`];
      const name = e.name === known.name ? [] : [
        `${r.name} (${r.id}): ${e.resref} shows "${e.name}", the game files give "${known.name}"`,
      ];
      const time = known.longest === null || e.seconds <= known.longest + 1 ? [] : [
        `${r.name} (${r.id}): ${e.resref} has ${e.seconds} s left, longer than its spell file's ${known.longest} s`,
      ];
      return [...name, ...time];
    })
  );
}

/** The records' spells, one line each creature with any: name, then each spell and time left. */
export function spellSummary(records: CreatureRecord[]): string[] {
  return records.filter((r) => (r.effects ?? []).length > 0).map((r) =>
    `  ${r.name}: ${r.effects!.map((e) => `${e.name} ${e.seconds} s (${e.resref})`).join(", ")}`
  );
}
