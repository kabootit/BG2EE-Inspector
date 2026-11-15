/**
 * Judging the effect probe from a session log.
 *
 * test/lua/a7xeff.lua writes A7XEFF lines, each a JSON object defined in src/model/schemas.ts
 * (EffectLine). This folds them into runs and judges the latest: both effect lists of every probed
 * member read to their end; every effect's fields look like an effect's (an opcode in range, a
 * timing mode IESDP lists, a source that is a resource name), which a wrong layout would fail; and
 * the presence gate, every icon an opcode-142 effect shows listed in the record screen's
 * statusEffects (iconProblems).
 */
import {
  EffectLine,
  type EffectMember,
  type EffectRun,
  exhaustive,
  type Kind,
  parseLines,
} from "../model/schemas.ts";

/** The two list heads re effect-lists found, as sprite offsets. */
export const HEADS = [0x49a0, 0x49f0] as const;

/**
 * What the first probe run (2026-11-15) showed each list holds: every effect on +0x49a0 has timing
 * mode 2 (while equipped) and an item as source; +0x49f0 holds the spells' and abilities' effects.
 */
export const LIST_NAMES: Record<number, string> = { 0x49a0: "equipped", 0x49f0: "timed" };

/** Opcode 142 shows a status icon: its parameter 2 is the icon (IESDP). */
export const ICON_OPCODE = 142;

/** Above this an opcode is not one: a plausibility bound, not the list of valid opcodes. */
export const OPCODE_LIMIT = 1000;

/** The timing modes IESDP's EFF V2.0 page lists: 0 to 10, and 4096 (absolute duration). */
export const TIMING_MODES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 4096];

/** A resource name as a file has it: up to 8 letters, digits and the punctuation resrefs use. */
const RESREF = /^[A-Za-z0-9_#!-]{0,8}$/;

/** Every run of the effect probe in a log, in run order, and the lines that are not EffectLines. */
export function parseEffects(log: string): { runs: EffectRun[]; problems: string[] } {
  const parsed = parseLines(log, "A7XEFF", EffectLine);
  const runs = new Map<number, EffectRun>();
  const member = (run: EffectRun, id: number): EffectMember => {
    let m = run.members.find((x) => x.id === id);
    if (!m) {
      m = { id, lists: [], effects: [] };
      run.members.push(m);
    }
    return m;
  };
  for (const line of parsed.lines) {
    const run: EffectRun = runs.get(line.run) ?? { run: line.run, members: [] };
    runs.set(line.run, run);
    switch (line.kind) {
      case "party":
        run.size = line.size;
        run.ticks = line.ticks;
        break;
      case "list":
        member(run, line.id).lists.push(line);
        break;
      case "effect":
        member(run, line.id).effects.push(line);
        break;
      case "status":
        member(run, line.id).status = line;
        break;
      case "skip":
        member(run, line.id).skip = line.why;
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

/** Why one effect's fields do not look like an effect's; empty when they do. */
export function effectProblems(e: Kind<EffectLine, "effect">): string[] {
  const out: string[] = [];
  const at = `${e.id} +0x${e.head.toString(16)}[${e.index}]`;
  if (e.opcode === undefined || e.opcode < 0 || e.opcode >= OPCODE_LIMIT) {
    out.push(`${at}: opcode ${e.opcode ?? "unread"}`);
  }
  if (e.timing === undefined || !TIMING_MODES.includes(e.timing)) {
    out.push(`${at}: timing mode ${e.timing ?? "unread"}`);
  }
  if (e.source === undefined || !RESREF.test(e.source)) {
    out.push(`${at}: source ${JSON.stringify(e.source)}`);
  }
  // The first probe read the resource too; the walker does not.
  if (e.resource !== undefined && !RESREF.test(e.resource)) {
    out.push(`${at}: resource ${JSON.stringify(e.resource)}`);
  }
  return out;
}

/** The icons the record screen lists, by number, each with its text's strref. */
export function listedIcons(status: Kind<EffectLine, "status">): Map<number, number | undefined> {
  return new Map(status.entries.map((entry): [number, number | undefined] => {
    const strref = entry.match(/strRef=(-?\d+)/)?.[1];
    return [Number(entry.split(":")[0]), strref === undefined ? undefined : Number(strref)];
  }));
}

/** The icons a member's effects show (opcode 142, parameter 2), each with the sources showing it. */
export function shownIcons(m: EffectMember): Map<number, string[]> {
  const shown = new Map<number, string[]>();
  for (const e of m.effects.filter((e) => e.opcode === ICON_OPCODE && e.p2 !== undefined)) {
    const sources = shown.get(e.p2!) ?? [];
    if (!sources.includes(e.source ?? "")) sources.push(e.source ?? "");
    shown.set(e.p2!, sources);
  }
  return shown;
}

/**
 * The presence gate for one member: every icon an opcode-142 effect on either list shows must be
 * one the record screen lists. An icon listed without such an effect is not a failure: the engine
 * also shows icons from other opcodes (92, "Spell Sequencer Active", with Spell Sequencer).
 */
export function iconProblems(m: EffectMember): string[] {
  if (!m.status) {
    return [`${m.id}: no record screen data (open its record screen before the probe)`];
  }
  const listed = listedIcons(m.status);
  return [...shownIcons(m)].filter(([icon]) => !listed.has(icon)).map(([icon, sources]) =>
    `${m.id}: icon ${icon} (from ${sources.join(", ") || "no source"}) is not in statusEffects`
  );
}

/**
 * One member's effects in a few lines, by list and then by source: each source with its name (from
 * `nameOf`), how many effects, their timing modes, the expiry times of the absolute ones (timing
 * mode 4096) and the icons they show; then the record screen's statusEffects, the icons it lists
 * that no opcode-142 effect shows (with their text, from `textOf`), and characters[id]'s keys.
 */
export function memberSummary(
  m: EffectMember,
  nameOf: (resref: string) => string,
  textOf: (strref: number) => string = () => "",
): string[] {
  const out: string[] = [];
  for (const head of HEADS) {
    const effects = m.effects.filter((e) => e.head === head);
    const bySource = Map.groupBy(effects, (e) => e.source ?? "");
    out.push(
      `  +0x${head.toString(16)} ${
        LIST_NAMES[head]
      }: ${effects.length} effects from ${bySource.size} sources`,
    );
    for (const [source, group] of bySource) {
      const timings = [...new Set(group.map((e) => e.timing))].join(",");
      const expiries = group.filter((e) => e.timing === 4096).map((e) => e.duration ?? 0);
      const icons = group.filter((e) => e.opcode === ICON_OPCODE).map((e) => e.p2);
      const name = source === "" ? "(no source)" : `${source.padEnd(8)}  ${nameOf(source)}`;
      out.push(
        `    ${name}  ${group.length} effects  timing ${timings}` +
          (expiries.length > 0
            ? `  expires ${Math.min(...expiries)}..${Math.max(...expiries)}`
            : "") +
          (icons.length > 0 ? `  icons ${icons.join(" ")}` : ""),
      );
    }
  }
  if (m.status) {
    out.push(`  statusEffects: ${m.status.entries.join(" | ") || "none"}`);
    const shown = shownIcons(m);
    const others = [...listedIcons(m.status)].filter(([icon]) => !shown.has(icon)).map((
      [icon, strref],
    ) => `${icon} ${JSON.stringify(strref === undefined ? "" : textOf(strref))}`);
    out.push(`  icons listed without an opcode-142 effect: ${others.join(", ") || "none"}`);
    out.push(`  characters[id] keys: ${m.status.keys.join(" ") || "none"}`);
  }
  return out;
}

/** Why a run of the effect probe does not pass; empty when it does. */
export function effectRunProblems(run: EffectRun): string[] {
  if (run.error) return [`the probe could not run: ${run.error}`];
  const probed = run.members.filter((m) => m.lists.length > 0);
  if (probed.length === 0) return ["no party member probed"];
  const out: string[] = [];
  for (const m of probed) {
    for (const head of HEADS) {
      const list = m.lists.find((l) => l.head === head);
      if (!list) out.push(`${m.id}: no list at +0x${head.toString(16)}`);
      else if (list.why) out.push(`${m.id} +0x${head.toString(16)}: ${list.why}`);
      else if (list.capped) out.push(`${m.id} +0x${head.toString(16)}: stopped at the node cap`);
    }
    out.push(...m.effects.flatMap(effectProblems));
    out.push(...iconProblems(m));
  }
  return out;
}
