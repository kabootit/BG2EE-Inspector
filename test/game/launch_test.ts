import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { launchCommand, summarize } from "../../src/game/launch.ts";
import { BIN } from "../../src/shared/config.ts";

const GAME = "/Games/BG2.app/Contents/MacOS/BaldursGateIIEnhancedEdition";

Deno.test("the injected launch sets the variable through env inside script's arguments", () => {
  deepStrictEqual(launchCommand({ binary: GAME, dylib: "/repo/build/a7x.dylib", inject: true }), {
    cmd: BIN.script,
    args: ["-q", "/dev/null", BIN.env, "DYLD_INSERT_LIBRARIES=/repo/build/a7x.dylib", GAME],
  });
});

Deno.test("the control launch is the same command without the library", () => {
  deepStrictEqual(launchCommand({ binary: GAME, dylib: "/repo/build/a7x.dylib", inject: false }), {
    cmd: BIN.script,
    args: ["-q", "/dev/null", GAME],
  });
});

Deno.test("a session shows the library loaded only when a marker names the game", () => {
  const game = "BaldursGateIIEnhancedEdition";
  const loaded = summarize(["start", `A7X loaded into ${game} pid=42`, "end"], game);
  strictEqual(loaded.loadedIntoGame, true);
  strictEqual(loaded.lines, 3);
  strictEqual(summarize(["A7X loaded into env pid=7"], game).loadedIntoGame, false);
  deepStrictEqual(summarize(["nothing"], game).loaded, []);
});
