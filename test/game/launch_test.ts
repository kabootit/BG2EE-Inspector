import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { isLibraryLine, isLoadMarker, launchCommand, summarize } from "../../src/game/launch.ts";
import { BIN } from "../../src/shared/config.ts";

const GAME = "/Games/BG2.app/Contents/MacOS/BaldursGateIIEnhancedEdition";

Deno.test("the injected launch sets the variable through env inside script's arguments", () => {
  deepStrictEqual(
    launchCommand({ binary: GAME, dylib: "/repo/build/inspector.dylib", inject: true }),
    {
      cmd: BIN.script,
      args: ["-q", "/dev/null", BIN.env, "DYLD_INSERT_LIBRARIES=/repo/build/inspector.dylib", GAME],
    },
  );
});

Deno.test("the control launch is the same command without the library", () => {
  deepStrictEqual(
    launchCommand({ binary: GAME, dylib: "/repo/build/inspector.dylib", inject: false }),
    {
      cmd: BIN.script,
      args: ["-q", "/dev/null", GAME],
    },
  );
});

Deno.test("a session shows the library loaded only when a marker names the game", () => {
  const game = "BaldursGateIIEnhancedEdition";
  const marker = `Inspector loaded into ${game} pid=42`;
  strictEqual(isLoadMarker(marker), true);
  strictEqual(isLoadMarker("start"), false);
  deepStrictEqual(summarize([marker], game), { loaded: [marker], loadedIntoGame: true });
  strictEqual(summarize(["Inspector loaded into env pid=7"], game).loadedIntoGame, false);
  deepStrictEqual(summarize(["nothing"], game).loaded, []);
});

Deno.test("every line the library prints is shown, and nothing from the game", () => {
  // Lines in the forms native/inspector.c prints, and engine lines from the hook gate session log.
  for (
    const line of [
      "Inspector loaded into BaldursGateIIEnhancedEdition pid=56386",
      "Inspector build 2.7.3 arm64 matched, 13 sites checked, image at 0x102a4c000",
      "Inspector registered Inspector_native at 0.4s, glClear call 1",
      "Inspector disabled: unknown build F2C1D179-AE19-3C26-8FA8-275502DC7DD3",
    ]
  ) strictEqual(isLibraryLine(line), true, line);
  for (
    const line of [
      "2026-11-06 17:09:44.374 BaldursGateIIEnhancedEdition[56386:76204894] INFO: LUA: Initializing Quests",
      "gl.majorVersion: 2",
      "INSPECTOR_T version 1 2.7.3 arm64",
    ]
  ) strictEqual(isLibraryLine(line), false, line);
});
