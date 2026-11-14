/**
 * Judging the spawn check from a session log.
 *
 * test/lua/a7xspawn.lua spawns fixture creatures and writes A7XSPAWN lines through Infinity_Log:
 * the spawns, then for each fixture creature in the area on screen the walker's values and the
 * `.cre` header the engine holds. This parses them and compares each creature with its `.cre`
 * file (src/gamefiles/), field by field. The run that spawned is judged, because a `.cre` describes
 * a creature as it is spawned: every fixture spawned in the session found, and every compared field
 * equal. Later runs are printed with what changed since: in the second spawn run the tester attacked
 * the creatures, and one turned hostile (EA 255) and three died (HP 0), live values the walker should
 * show. The header comparison is evidence, not judged.
 *
 * One engine rule applies: the AC the engine uses is the file's AC plus the Dexterity adjustment in
 * DEXMOD.2DA's AC column, found by the first run of the spawn check (a drow with DEX 18 read 6
 * against a file AC of 10, and DEXMOD gives -4 for 18).
 */
import { CRE_RESISTANCES, CRE_SAVES, type Creature } from "../gamefiles/iebinary.ts";

/** The walker's resistance order (A7XWALK.RESISTS): the file's, without magic resistance. */
const WALKER_RESISTS = CRE_RESISTANCES.filter((r) => r !== "magic");

export type SpawnedCreature = {
  id: string;
  resref: string;
  block: string;
  hp: string;
  values: Map<string, string>;
};
export type SpawnRun = {
  run: number;
  spawned: { resref: string; ok: boolean; why: string }[];
  creatures: SpawnedCreature[];
  headers: Map<string, Uint8Array | null>;
  error?: string;
};
export type Comparison = { field: string; walker: string; file: string; ok: boolean };

const LINE = /A7XSPAWN (\d+) (\S+) ?(.*)$/;

/** A creature line's fields, named as the comparison names them. */
function creatureValues(rest: string): SpawnedCreature | null {
  const words = rest.split(" ");
  const id = words[0];
  const kv = new Map(
    words.slice(1).map((w) => [w.slice(0, w.indexOf("=")), w.slice(w.indexOf("=") + 1)]),
  );
  const resref = kv.get("resref");
  if (!id || !resref) return null;
  const values = new Map<string, string>();
  const [cur, max] = (kv.get("hp") ?? "").split("/");
  values.set("hp.max", max ?? "");
  const ac = (kv.get("ac") ?? "").split(",");
  ["ac", "ac.crushing", "ac.missile", "ac.piercing", "ac.slashing"].forEach((f, i) =>
    values.set(f, ac[i] ?? "")
  );
  values.set("thac0", kv.get("thac0") ?? "");
  const saves = (kv.get("saves") ?? "").split(",");
  CRE_SAVES.forEach((s, i) => values.set(`save.${s}`, saves[i] ?? ""));
  const resist = (kv.get("resist") ?? "").split(",");
  WALKER_RESISTS.forEach((r, i) => values.set(`resist.${r}`, resist[i] ?? ""));
  values.set("mr", kv.get("mr") ?? "");
  values.set("ea", kv.get("ea") ?? "");
  return { id, resref, block: kv.get("block") ?? "", hp: `${cur}/${max}`, values };
}

function hexBytes(hex: string): Uint8Array | null {
  if (!/^([0-9a-f]{2})+$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

/** Every run of the spawn check in a log, in run order. */
export function parseSpawns(log: string): SpawnRun[] {
  const runs = new Map<number, SpawnRun>();
  for (const raw of log.split("\n")) {
    const m = raw.trimEnd().match(LINE);
    if (!m) continue;
    const n = Number(m[1]);
    const run: SpawnRun = runs.get(n) ?? { run: n, spawned: [], creatures: [], headers: new Map() };
    runs.set(n, run);
    const [, , kind, rest] = m;
    if (kind === "spawn") {
      const [resref, result, ...why] = rest.split(" ");
      run.spawned.push({ resref, ok: result === "ok", why: why.join(" ") });
    } else if (kind === "creature") {
      const c = creatureValues(rest);
      if (c) run.creatures.push(c);
    } else if (kind === "header") {
      const [id, hex] = rest.split(" ");
      run.headers.set(id, hexBytes(hex ?? ""));
    } else if (kind === "error") {
      run.error = rest;
    }
  }
  return [...runs.values()].sort((a, b) => a.run - b.run);
}

/**
 * The values a creature's `.cre` file gives for each compared field, with `dexAc`, the DEXMOD.2DA
 * AC adjustment for the creature's Dexterity, added to its AC.
 */
export function fileValues(cre: Creature, dexAc: number): Map<string, string> {
  const v = new Map<string, string>();
  v.set("hp.max", String(cre.maxHp));
  v.set("ac", String(cre.acEffective + dexAc));
  v.set("ac.crushing", String(cre.acCrushing));
  v.set("ac.missile", String(cre.acMissile));
  v.set("ac.piercing", String(cre.acPiercing));
  v.set("ac.slashing", String(cre.acSlashing));
  v.set("thac0", String(cre.thac0));
  for (const s of CRE_SAVES) v.set(`save.${s}`, String(cre.saves[s]));
  for (const r of WALKER_RESISTS) v.set(`resist.${r}`, String(cre.resistances[r]));
  v.set("mr", String(cre.resistances.magic));
  v.set("ea", String(cre.ea));
  return v;
}

/** The walker's values for one creature against its file, field by field. */
export function compareCreature(
  c: SpawnedCreature,
  cre: Creature,
  dexAc: number,
): Comparison[] {
  return [...fileValues(cre, dexAc)].map(([field, file]) => {
    const walker = c.values.get(field) ?? "";
    return { field, walker, file, ok: walker === file };
  });
}

/** Offsets at which the engine's copy of the header differs from the file's. */
export function headerDifferences(header: Uint8Array, file: Uint8Array, size: number): number[] {
  return Array.from({ length: size }, (_, i) => i).filter((i) => header[i] !== file[i]);
}

/** The run to judge: the one that spawned, or the first when none did in this log. */
export function judgedRun(runs: SpawnRun[]): SpawnRun {
  return runs.find((r) => r.spawned.length > 0) ?? runs[0];
}

/** What a later reading of a creature changed since an earlier one: "field: before -> after". */
export function changesSince(earlier: SpawnedCreature, later: SpawnedCreature): string[] {
  const out = earlier.hp === later.hp ? [] : [`hp: ${earlier.hp} -> ${later.hp}`];
  for (const [field, before] of earlier.values) {
    const after = later.values.get(field) ?? "";
    if (after !== before) out.push(`${field}: ${before} -> ${after}`);
  }
  return out;
}

/** Why a run fails before any field is compared: an error, or a spawned fixture not found. */
export function spawnProblems(run: SpawnRun, spawnedInSession: string[]): string[] {
  if (run.error) return [`the check could not run: ${run.error}`];
  const found = new Set(run.creatures.map((c) => c.resref));
  const missing = spawnedInSession.filter((r) => !found.has(r));
  if (spawnedInSession.length === 0) return ["no fixture was spawned in this session"];
  return missing.map((r) => `${r}: spawned but not found in run ${run.run}`);
}
