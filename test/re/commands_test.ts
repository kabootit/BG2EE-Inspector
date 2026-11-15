import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { commandFor, COMMANDS, notesRows, requiredArgs, usage } from "../../src/re/commands.ts";

Deno.test("the re-notes commands table lists every command, in order, as src/re/commands.ts has it", async () => {
  const notes = await Deno.readTextFile("docs/re-notes.md");
  const rows = notes.split("\n").filter((line) => line.startsWith("| `deno task re "));
  deepStrictEqual(rows, notesRows());
});

Deno.test("required arguments are the ones in angle brackets", () => {
  const required = Object.fromEntries(COMMANDS.map((c) => [c.name, requiredArgs(c)]));
  deepStrictEqual(required, {
    starts: 0,
    xrefs: 1,
    annotate: 1,
    compare: 2,
    stats: 1,
    hash: 1,
    "area-fields": 0,
    "id-fields": 0,
    "effect-lists": 0,
    "game-clock": 0,
  });
});

Deno.test("a command is found only by its name and with its required arguments", () => {
  strictEqual(commandFor("compare", ["lua_settop", "0x5499cc"])?.name, "compare");
  strictEqual(commandFor("compare", ["lua_settop"]), undefined);
  strictEqual(commandFor("starts", [])?.name, "starts");
  strictEqual(commandFor("nope", []), undefined);
  strictEqual(commandFor(undefined, []), undefined);
});

Deno.test("the usage text names every command, without markdown", () => {
  const text = usage();
  for (const c of COMMANDS) strictEqual(text.includes(`deno task re ${c.name}`), true, c.name);
  strictEqual(text.includes("`"), false);
});
