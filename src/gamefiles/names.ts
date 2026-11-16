/**
 * The names the game shows for spells and items, as string references, for the inspector's Lua.
 *
 * The game's Lua has no call that names a spell or an item from its resref, but it has
 * `Infinity_FetchString(strref)`. So `deno task install-mod` writes `inspname.lua`, a table of
 * resref to strref for every spell and item file, and the inspector fetches each name in the game,
 * in the game's own language. A helper spell often has no name of its own (`SPCL920A` holds the
 * effects of `SPCL920`, Enhanced Bard Song), so a nameless spell takes the name of the resref
 * without its last character, marked as a guess.
 */
import { readNameStrrefs, RES_TYPE, type StringTable } from "./iebinary.ts";
import { type GameFiles, readResource } from "./resources.ts";

/** Strref 0, `<NO TEXT>` in dialog.tlk: a placeholder, not a name. */
const NO_TEXT = 0;

/** A name's string reference, and whether it is a parent spell's, guessed. */
export type NameRef = { strref: number; guess: boolean };

/**
 * The strref of the name the game shows for a spell or an item: a spell file's if there is one (the
 * unidentified name, a spell's only one), else an item file's (identified first); null when there
 * is neither or the name has no string other than `<NO TEXT>`.
 */
export async function ownNameStrref(
  files: GameFiles,
  strings: StringTable,
  resref: string,
): Promise<number | null> {
  const spell = await readResource(files, resref, "spl");
  const item = spell ? null : await readResource(files, resref, "itm");
  const order = spell
    ? ((n) => [n.unidentified, n.identified])(readNameStrrefs(spell.bytes, "spl"))
    : item
    ? ((n) => [n.identified, n.unidentified])(readNameStrrefs(item.bytes, "itm"))
    : [];
  return order.find((strref) => strref !== NO_TEXT && strings.get(strref) !== null) ?? null;
}

/** The name the game shows for a spell or an item, or null (ownNameStrref's text). */
export async function readName(
  files: GameFiles,
  strings: StringTable,
  resref: string,
): Promise<string | null> {
  const strref = await ownNameStrref(files, strings, resref);
  return strref === null ? null : strings.get(strref);
}

/** A resref's own name strref, else its parent's (the resref without its last character), guessed. */
export async function nameRef(
  files: GameFiles,
  strings: StringTable,
  resref: string,
): Promise<NameRef | null> {
  const own = await ownNameStrref(files, strings, resref);
  if (own !== null) return { strref: own, guess: false };
  const parent = resref.length > 1
    ? await ownNameStrref(files, strings, resref.slice(0, -1))
    : null;
  return parent === null ? null : { strref: parent, guess: true };
}

/** Every spell and item resref in the game, in capitals: the KEY's and override/'s. */
export function spellAndItemResrefs(files: GameFiles): string[] {
  const types = new Set<number>([RES_TYPE.spl, RES_TYPE.itm]);
  const keyed = files.key.entries.filter((e) => types.has(e.type)).map((e) => e.resref);
  const loose = [...files.override.keys()]
    .map((name) => name.match(/^(.+)\.(?:spl|itm)$/)?.[1])
    .filter((resref): resref is string => resref !== undefined);
  return [...new Set([...keyed, ...loose].map((r) => r.toUpperCase()))].sort();
}

/** Resref to name strref for every spell and item with a name, its own or a guessed parent's. */
export async function nameStrrefs(
  files: GameFiles,
  strings: StringTable,
): Promise<Map<string, number>> {
  const refs = await Promise.all(
    spellAndItemResrefs(files).map(async (resref) =>
      [resref, await nameRef(files, strings, resref)] as const
    ),
  );
  return new Map(
    refs.filter(([, ref]) => ref !== null).map(([resref, ref]): [string, number] => [
      resref,
      ref!.strref,
    ]),
  );
}

/** A resref as a Lua string: quotes and backslashes escaped; resrefs are printable ASCII. */
const luaString = (s: string): string => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/** The names table as a Lua file that sets the global INSPECTOR_NAMES, one entry a line, keys sorted. */
export function namesLua(names: Map<string, number>): string {
  const entries = [...names].filter(([resref]) => /^[\x20-\x7e]+$/.test(resref))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([resref, strref]) => `  [${luaString(resref)}] = ${strref},`);
  return [
    "-- inspname.lua: written by deno task install-mod from the game's spell and item files",
    "-- (src/gamefiles/names.ts): resref to the strref of the name the game shows for it.",
    "INSPECTOR_NAMES = {",
    ...entries,
    "}",
    "",
  ].join("\n");
}
