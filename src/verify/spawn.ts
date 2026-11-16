/**
 * Judging the spawn check from a session log.
 *
 * test/lua/inspspwn.lua spawns fixture creatures and writes INSPECTOR_SPAWN lines, each a JSON object
 * defined in src/model/schemas.ts (SpawnLine): the spawns, then for each fixture creature in the area
 * on screen the walker's values and the `.cre` header the engine holds. This folds them into runs and
 * compares each creature with its `.cre` file (src/gamefiles/), field by field. The run that spawned
 * is judged, because a `.cre` describes a creature as it is spawned: every fixture spawned in the
 * session found, and every compared field equal. Later runs are printed with what changed since: in
 * the second spawn run the tester attacked the creatures, and one turned hostile (EA 255) and three
 * died (HP 0), live values the walker should show. The header comparison is evidence, not judged.
 *
 * One engine rule applies: the AC the engine uses is the file's AC plus the Dexterity adjustment in
 * DEXMOD.2DA's AC column, found by the first run of the spawn check (a drow with DEX 18 read 6
 * against a file AC of 10, and DEXMOD gives -4 for 18).
 */
import type { Creature } from "../gamefiles/iebinary.ts";
import {
  type Comparison,
  exhaustive,
  parseLines,
  RESISTS,
  SAVES,
  type SpawnCreature,
  SpawnLine,
  type SpawnRun,
} from "../model/schemas.ts";

/**
 * Each compared field: its name, the walker's value from a creature line, and the value the
 * creature's `.cre` gives, with `dexAc`, the DEXMOD.2DA adjustment for its Dexterity, added to AC.
 */
const FIELDS: [
  field: string,
  walker: (c: SpawnCreature) => number,
  file: (cre: Creature, dexAc: number) => number,
][] = [
  ["hp.max", (c) => c.hp.max, (cre) => cre.maxHp],
  ["ac", (c) => c.ac.value, (cre, dexAc) => cre.acEffective + dexAc],
  ["ac.crushing", (c) => c.ac.crushing, (cre) => cre.acCrushing],
  ["ac.missile", (c) => c.ac.missile, (cre) => cre.acMissile],
  ["ac.piercing", (c) => c.ac.piercing, (cre) => cre.acPiercing],
  ["ac.slashing", (c) => c.ac.slashing, (cre) => cre.acSlashing],
  ["thac0", (c) => c.thac0, (cre) => cre.thac0],
  ...SAVES.map((
    s,
  ): typeof FIELDS[number] => [`save.${s}`, (c) => c.saves[s], (cre) => cre.saves[s]]),
  ...RESISTS.map((r): typeof FIELDS[number] => [
    `resist.${r}`,
    (c) => c.resist[r],
    (cre) => cre.resistances[r],
  ]),
  ["mr", (c) => c.mr, (cre) => cre.resistances.magic],
  ["ea", (c) => c.ea, (cre) => cre.ea],
];

function hexBytes(hex: string): Uint8Array | null {
  if (!/^([0-9a-f]{2})+$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

/** Every run of the spawn check in a log, in run order, and the lines that are not SpawnLines. */
export function parseSpawns(log: string): { runs: SpawnRun[]; problems: string[] } {
  const parsed = parseLines(log, "INSPECTOR_SPAWN", SpawnLine);
  const runs = new Map<number, SpawnRun>();
  for (const line of parsed.lines) {
    const run: SpawnRun = runs.get(line.run) ??
      { run: line.run, spawned: [], creatures: [], headers: new Map() };
    runs.set(line.run, run);
    switch (line.kind) {
      case "spawn":
        run.spawned.push(line);
        break;
      case "creature":
        run.creatures.push(line);
        break;
      case "header":
        run.headers.set(line.id, line.hex === undefined ? null : hexBytes(line.hex));
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

/** The walker's values for one creature against its file, field by field. */
export function compareCreature(c: SpawnCreature, cre: Creature, dexAc: number): Comparison[] {
  return FIELDS.map(([field, walker, file]) => {
    const w = walker(c), f = file(cre, dexAc);
    return { field, walker: w, file: f, ok: w === f };
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
export function changesSince(earlier: SpawnCreature, later: SpawnCreature): string[] {
  const hp = (c: SpawnCreature) => `${c.hp.cur}/${c.hp.max}`;
  const out = hp(earlier) === hp(later) ? [] : [`hp: ${hp(earlier)} -> ${hp(later)}`];
  for (const [field, walker] of FIELDS) {
    if (field === "hp.max") continue; // in hp above
    const before = walker(earlier), after = walker(later);
    if (before !== after) out.push(`${field}: ${before} -> ${after}`);
  }
  return out;
}

/** Why a run fails before any field is compared: an error, or a spawned fixture not found. */
export function spawnProblems(run: SpawnRun, spawnedInSession: string[]): string[] {
  if (run.error) return [`the check could not run: ${run.error}`];
  if (spawnedInSession.length === 0) return ["no fixture was spawned in this session"];
  const found = new Set(run.creatures.map((c) => c.resref));
  return spawnedInSession.filter((r) => !found.has(r))
    .map((r) => `${r}: spawned but not found in run ${run.run}`);
}
