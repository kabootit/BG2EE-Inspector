/**
 * The inspector's record, schema 1, as the one definition outside the game (ADR-0006,
 * docs/data-model.md): the TypeScript type comes from it, `deno task verify` checks every A7XDATA line
 * with it, and docs/data-model.schema.json is generated from it for tools that do not use TypeScript.
 *
 * The record is made in the game by mod/inspector/lib/a7xapi.lua; the golden file
 * test/fixtures/a7xdata.txt is checked against both, so the two cannot drift apart. Every object is
 * strict: a field the schema does not name fails, as a missing or mistyped one does.
 */
import { z } from "jsr:@zod/zod@4";

const int = z.number().int();
const SIDES = ["party", "ally", "neutral", "enemy"] as const;
const RESISTS = [
  "fire",
  "cold",
  "electricity",
  "acid",
  "magic_fire",
  "magic_cold",
  "slashing",
  "crushing",
  "piercing",
  "missile",
] as const;

/** An object with these integer fields, all required, nothing else. */
const integers = <K extends string>(keys: readonly K[]) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, int])) as Record<K, typeof int>);

export const RecordSchema = z.strictObject({
  schema: z.literal(1).describe("the record format's version"),
  id: int.describe("the engine's id for the creature, valid for this game session"),
  resref: z.string().max(8).describe("the name of the .cre file the creature was made from"),
  name: z.string().describe("the name the game shows for it"),
  allegiance: z.strictObject({
    ea: int.min(0).max(255).describe("the engine's allegiance value (IESDP's EA.IDS)"),
    side: z.enum(SIDES).describe("ea in words; party for a party member"),
  }).describe("whose side the creature is on"),
  hp: z.strictObject({ cur: int, max: int }).describe("hit points now, and the maximum"),
  ac: int.describe("armor class"),
  ac_mods: integers(["crushing", "missile", "piercing", "slashing"])
    .describe("AC adjustments against each kind of attack"),
  thac0: int.describe("THAC0, before the bonuses of the weapon in hand"),
  saves: integers(["death", "wand", "poly", "breath", "spell"]).describe("saving throws"),
  resist: integers(RESISTS).describe("resistances, in percent"),
  mr: int.describe("magic resistance, in percent"),
}).describe("A creature as the inspector reads it, schema 1");

export type CreatureRecord = z.infer<typeof RecordSchema>;

/** The record, or why it is not one: each problem as "<path>: <message>". */
export function parseRecord(json: unknown): { record: CreatureRecord } | { problems: string[] } {
  const result = RecordSchema.safeParse(json);
  if (result.success) return { record: result.data };
  return {
    problems: result.error.issues.map((i) => `${i.path.join(".") || "(record)"}: ${i.message}`),
  };
}

/** The schema as JSON Schema, for docs/data-model.schema.json. */
export function recordJsonSchema(): unknown {
  return z.toJSONSchema(RecordSchema);
}
