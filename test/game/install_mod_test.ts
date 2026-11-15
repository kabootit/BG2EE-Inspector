// deno task install-mod's logic (src/game/install_mod.ts) on a fake system: the checks that refuse
// before anything is written, the merge that keeps WeiDU's backup, and the WeiDU run itself.

import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { installMod, type ModSetup, pinnedWeidu, weiduArgs } from "../../src/game/install_mod.ts";
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

/** A game folder, the repo's mod folder and WeiDU; `answer` is how WeiDU's run ends. */
function machine(
  answer: RunResult = { code: 0, stdout: "SUCCESSFULLY INSTALLED\n", stderr: "" },
): ReturnType<typeof fakeSystem> {
  return fakeSystem(
    {
      [`${GAME}/chitin.key`]: "KEY V1  ",
      "/repo/mod/inspector/inspector.tp2": "BACKUP ~inspector/backup~",
      "/repo/mod/inspector/lib/a7x.lua": "-- a7x",
      [WEIDU]: BINARY,
    },
    (cmd) => cmd === WEIDU ? answer : undefined,
  );
}

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
