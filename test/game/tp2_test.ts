// mod/inspector/inspector.tp2, read as the tests need it (src/game/tp2.ts): what it copies, what it
// counts and replaces, the replacements applied to a menu shaped like the stock one, and each
// pattern against the game's own ui.menu, so a game update that moves an anchor fails here first.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { countMatches, patch, readTp2, weiduRegex } from "../../src/game/tp2.ts";
import { openGameFiles, readResource } from "../../src/gamefiles/resources.ts";
import { GAME_DIR } from "../../src/shared/config.ts";

const tp2 = readTp2(await Deno.readTextFile("mod/inspector/inspector.tp2"));

// The stock menu's shape around both anchors, CRLF line ends as in the game's file.
const MENU = [
  "\tcombatLog = {}",
  "menu",
  "{",
  '\tname "WORLD_ACTIONBAR"',
  "\talign center bottom",
  '\tonOpen "toolbarTop = 50"',
  "\tignoreEsc",
  "\tlabel",
  "\t{",
  "\t\tarea 0 0 746 57",
  "\t\tmosaic GUWBTP10",
  "\t}",
  "\tbutton",
  "\t{",
  "\t\tarea 21 12 32 32",
  "\t}",
  "}",
  "menu",
  "{",
  '\tname "WORLD_ACTIONBAR_HELP"',
  "\tlabel",
  "\t{",
  "\t\tmosaic GUWBTP10",
  "\t}",
  "}",
].join("\r\n");

Deno.test("a WeiDU regexp groups with \\( \\) and reads ( ) { } | as literal characters", () => {
  strictEqual(weiduRegex("combatLog = {}").source, "combatLog = \\{\\}");
  strictEqual(weiduRegex('\\(name "A"[^}]*}\\)').source, '(name "A"[^\\}]*\\})');
  strictEqual(weiduRegex("a\\|b(c)").source, "a|b\\(c\\)");
});

Deno.test("the tp2 copies every file in mod/inspector/lib, and nothing else", async () => {
  const lib: string[] = [];
  for await (const e of Deno.readDir("mod/inspector/lib")) lib.push(`inspector/lib/${e.name}`);
  deepStrictEqual([...tp2.copies].sort(), lib.sort());
});

Deno.test("every replacement uses a pattern the tp2 counts before patching", () => {
  strictEqual(tp2.replaces.length, 2);
  for (const r of tp2.replaces) strictEqual(tp2.counted.includes(r.pattern), true, r.pattern);
  strictEqual(tp2.vars.get("a7x_key"), "e");
});

Deno.test("each anchor occurs once in a menu shaped like the stock one", () => {
  for (const p of tp2.counted) strictEqual(countMatches(MENU, p), 1, p);
});

Deno.test("patching loads a7x after combatLog and puts the key button after the bar's label", () => {
  const lines = patch(MENU, tp2).split(/\r?\n/);
  const at = (text: string) => lines.indexOf(text);
  strictEqual(at('Infinity_DoFile("a7x")'), at("\tcombatLog = {}") + 1, "the load line");
  deepStrictEqual(lines.slice(at("\t\tmosaic GUWBTP10") + 1, at("\t\tmosaic GUWBTP10") + 7), [
    "\t}",
    "\tbutton",
    "\t{",
    "\t\ton 'e'",
    '\t\taction "A7X.show()"',
    "\t}",
  ]);
  strictEqual(lines.filter((l) => l.includes("A7X.show()")).length, 1, "in WORLD_ACTIONBAR only");
});

/** The game's ui.menu as the engine finds it, override/ first, or undefined with no game. */
async function gameMenu(): Promise<{ text: string; source: string } | undefined> {
  try {
    const menu = await readResource(await openGameFiles(GAME_DIR), "UI", "menu");
    return menu ? { text: new TextDecoder().decode(menu.bytes), source: menu.source } : undefined;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

Deno.test("the installed game: each anchor occurs once in ui.menu, the key anchor ending a label", async () => {
  const menu = await gameMenu();
  if (!menu) return;
  for (const p of tp2.counted) strictEqual(countMatches(menu.text, p), 1, `${p} in ${menu.source}`);
  const key = tp2.replaces[1].pattern;
  const matched = menu.text.match(weiduRegex(key, ""))![0];
  strictEqual(/label\s*\{\s*area 0 0 746 57\s*mosaic GUWBTP10\s*\}$/.test(matched), true, matched);
});
