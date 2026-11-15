// deno task install-mod's logic (src/game/install_mod.ts) on a fake system: the checks that refuse
// before anything is written, the merge that keeps WeiDU's backup, and the WeiDU run itself.

import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import {
  installMod,
  listsComponent,
  type ModSetup,
  pinnedWeidu,
  weiduArgs,
} from "../../src/game/install_mod.ts";
import { KNOWN_WEIDU } from "../../src/shared/config.ts";
import { sha256Hex } from "../../src/shared/sha256.ts";
import type { RunResult } from "../../src/setup/system.ts";
import { fakeSystem } from "../setup/fake_system.ts";

const GAME = "/game";
const WEIDU = "/repo/vendor/weidu/weidu";
const BINARY = new TextEncoder().encode("a fake weidu");
const SETUP: ModSetup = {
  gameDir: GAME,
  modDir: "/repo/mod/inspector",
  weidu: WEIDU,
  weiduSha256: await sha256Hex(BINARY),
};

// WeiDU.log as WeiDU wrote it in a scratch game folder (2026-11-14): its header, then one line per
// installed component.
const LOG_HEADER = "// Log of Currently Installed WeiDU Mods\n";
const LOG_ENTRY =
  "~INSPECTOR/INSPECTOR.TP2~ #0 #0 // BG2EE-Inspector: a creature's stats on one key\n";

/**
 * A game folder, the repo's mod folder and WeiDU. `answer` is how WeiDU's run ends; with
 * `writesLog`, it updates WeiDU.log as it does on success: the component's line after an install,
 * none after an uninstall.
 */
function machine(
  answer: RunResult = { code: 0, stdout: "SUCCESSFULLY INSTALLED\n", stderr: "" },
  writesLog = true,
): ReturnType<typeof fakeSystem> {
  const sys = fakeSystem(
    {
      [`${GAME}/chitin.key`]: "KEY V1  ",
      [`${GAME}/WeiDU.log`]: LOG_HEADER,
      "/repo/mod/inspector/inspector.tp2": "BACKUP ~inspector/backup~",
      "/repo/mod/inspector/lib/a7x.lua": "-- a7x",
      [WEIDU]: BINARY,
    },
    (cmd, args) => {
      if (cmd !== WEIDU) return undefined;
      const log = args.includes("--force-uninstall") ? LOG_HEADER : LOG_HEADER + LOG_ENTRY;
      if (writesLog) sys.files.set(`${GAME}/WeiDU.log`, new TextEncoder().encode(log));
      return answer;
    },
  );
  return sys;
}

Deno.test("WeiDU.log lists the component by its tp2 path in capitals, language 0, component 0", () => {
  strictEqual(listsComponent(LOG_HEADER + LOG_ENTRY), true);
  strictEqual(listsComponent(LOG_HEADER), false);
  strictEqual(listsComponent(`${LOG_HEADER}~IWDIFICATION/IWDIFICATION.TP2~ #0 #0 // x\n`), false);
  // After an uninstall WeiDU keeps the line as a comment, which does not list it.
  strictEqual(listsComponent(`${LOG_HEADER}// Recently Uninstalled: ${LOG_ENTRY}`), false);
});

Deno.test("WeiDU installs or uninstalls the tp2 by path from the game folder, without pausing", () => {
  deepStrictEqual(weiduArgs(GAME, false), [
    "--game",
    GAME,
    "inspector/inspector.tp2",
    "--force-install",
    "0",
    "--language",
    "0",
    "--no-exit-pause",
  ]);
  strictEqual(weiduArgs(GAME, true)[3], "--force-uninstall");
});

Deno.test("the task pins the WeiDU v251 arm64 binary", () => {
  const pinned = KNOWN_WEIDU.find((w) => w.sha256 === pinnedWeidu());
  strictEqual(`${pinned?.version} ${pinned?.arch}`, "251.00 arm64");
});

Deno.test("an install copies the mod into the game folder, then runs WeiDU there", async () => {
  const sys = machine();
  const result = await installMod(sys, SETUP, false);
  strictEqual(new TextDecoder().decode(sys.files.get(`${GAME}/inspector/lib/a7x.lua`)), "-- a7x");
  strictEqual(sys.files.has(`${GAME}/inspector/inspector.tp2`), true, "the tp2");
  deepStrictEqual(sys.ran, [[WEIDU, ...weiduArgs(GAME, false)]]);
  deepStrictEqual(sys.ranIn, [GAME], "WeiDU's working directory");
  strictEqual(result.weiduOutput, "SUCCESSFULLY INSTALLED\n");
  strictEqual(result.lines.at(-1), "installed");
});

Deno.test("a reinstall keeps WeiDU's backup, and an uninstall runs --force-uninstall", async () => {
  const sys = machine();
  sys.files.set(`${GAME}/inspector/backup/0/ui.menu`, new TextEncoder().encode("stock"));
  await installMod(sys, SETUP, true);
  strictEqual(
    new TextDecoder().decode(sys.files.get(`${GAME}/inspector/backup/0/ui.menu`)),
    "stock",
  );
  deepStrictEqual(sys.ran, [[WEIDU, ...weiduArgs(GAME, true)]]);
});

Deno.test("no game folder, no WeiDU or the wrong WeiDU refuses before anything is written", async () => {
  const cases: [string, (sys: ReturnType<typeof fakeSystem>) => void, RegExp][] = [
    ["no chitin.key", (sys) => sys.files.delete(`${GAME}/chitin.key`), /not a game folder/],
    ["no WeiDU", (sys) => sys.files.delete(WEIDU), /run deno task setup-weidu/],
    [
      "another WeiDU",
      (sys) => sys.files.set(WEIDU, new TextEncoder().encode("something else")),
      /not the pinned WeiDU v251\.00 arm64 \(SHA-256 [0-9a-f]{64}\)/,
    ],
  ];
  for (const [what, change, message] of cases) {
    const sys = machine();
    change(sys);
    const before = [...sys.files.keys()].sort();
    await rejects(installMod(sys, SETUP, false), message, what);
    deepStrictEqual([...sys.files.keys()].sort(), before, `${what}: nothing written`);
    deepStrictEqual(sys.ran, [], `${what}: nothing run`);
  }
});

Deno.test("a failed WeiDU run fails with its output", async () => {
  const sys = machine({ code: 1, stdout: "ERROR: anchor not found\n", stderr: "" });
  await rejects(
    installMod(sys, SETUP, false),
    /WeiDU exited with code 1:\nERROR: anchor not found/,
  );
});

// The first Hotkey and install run (2026-11-14): WeiDU could not parse the tp2, printed a FATAL
// ERROR, wrote nothing, and still exited 0.
Deno.test("WeiDU exiting 0 without logging the component fails, with its output", async () => {
  const fatal = { code: 0, stdout: "FATAL ERROR: Parsing.Parse_error\n", stderr: "" };
  await rejects(
    installMod(machine(fatal, false), SETUP, false),
    /WeiDU\.log does not list inspector\/inspector\.tp2 after WeiDU ran:\nFATAL ERROR: Parsing\.Parse_error/,
  );
  const stays = machine(fatal, false);
  stays.files.set(`${GAME}/WeiDU.log`, new TextEncoder().encode(LOG_HEADER + LOG_ENTRY));
  await rejects(installMod(stays, SETUP, true), /WeiDU\.log still lists inspector\/inspector\.tp2/);
});
