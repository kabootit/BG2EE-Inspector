---
type: manual-test
title: "Bridge"
description: "One play session with the Phase 2 bridge loaded: the library checks every engine site, registers Inspector_native into the game's Lua, and a test script run from the debug console calls its four read functions in a loaded game and again after an area change. The gate for Phase 2."
duration: "about 10 minutes, 6 of them in the game"
---

# Manual test: Bridge

This session checks the Phase 2 bridge in the game. It shows whether the library accepts this build
(every engine function and anchor hashes as `native/builds.h` expects), registers the `Inspector_native` table
once Lua is idle, and whether the four functions in it return what they should when called from the
game's own Lua. The functions only read, so the game should look and play exactly as usual. What the
bridge is and why it registers this way: [ADR-0005](../adr/0005-dyld-interposing-hook.md); the
functions themselves: [ADR-0002](../adr/0002-read-only-bridge-lua-walker.md#native-bridge).

The calls come from a test script, `test/lua/inspt.lua`, copied into the game's `override/` folder for
the session. The debug console opens only in a loaded game, does not accept pasted text, and takes
one line at a time, so the tester types only `Infinity_DoFile("inspt")`, which loads and runs the
script; BG2EE-GameLog loads its tap the same way. Each run of the script writes numbered `INSPECTOR_T` lines
to the session log; nothing appears on screen.

## Before you start

- **The game is not running.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
  `deno task doctor` reports it; edit it only while the game is not running.
- **The test script is in the game's `override/` folder.** From the repo folder:

  ```sh
  mkdir -p "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override"
  cp test/lua/inspt.lua "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override/"
  ```

  Step 7 removes it again at the end.
- **A save to load**, in an area with an exit nearby. The bridge changes nothing, and the session needs
  no saving.
- **About 10 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `build` should report `arm64, Signature=adhoc`. `play` names its session log and shows the
   library's own lines as they arrive: expect `Inspector loaded`, `Inspector build 2.7.3 arm64 matched` and, within
   a second, `Inspector registered Inspector_native`.
2. **Main menu, 30 seconds.** Nothing to do: the registration line should already be there.
3. **Load the save, then run the script** (1 minute). Open the console with Ctrl+Space, type the line
   below, press Enter, and close the console with Ctrl+Space:

   ```lua
   Infinity_DoFile("inspt")
   ```

   This makes run 1.
4. **Play, 2 minutes.** Walk around; open the inventory once.
5. **Change area** through an exit or a building door, then run the script again the same way
   (1 minute). This makes run 2.
6. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.
7. **Remove the test script**, and the `override/` folder if it is now empty:

   ```sh
   rm "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override/inspt.lua"
   rmdir "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.

## What to watch for

The bridge passes every `glClear` through and only reads, so nothing should differ from normal play.
Stop and quit if you see:

- stutter or a lower frame rate;
- black or flickering frames;
- a freeze or a crash, especially right after running the script.

If the party dies or the session ends before run 2, the run is incomplete rather than failed: say so,
and run the test again from the start, with a save that makes the area change easy.

Then report what you saw and at which step. A failed run still counts, and its log up to that point is
the evidence.

## Pass criteria

Say "done" when `play` has exited. Then read the newest `logs/session-<stamp>.log` for the
library's lines, which start with `I`, and the script's, which the engine writes inside its own log
lines (`… INFO: LUA: INSPECTOR_T 1 native table`). To see both: `grep 'I' logs/session-<stamp>.log`.

The run passes when every line below appears as described, for both runs of the script (`INSPECTOR_T 1 …` and
`INSPECTOR_T 2 …`), there is no `Inspector disabled` line and no `LUA ERROR`, and the game played normally:

| Check | Log line | Pass when |
| --- | --- | --- |
| Build and sites | `Inspector build 2.7.3 arm64 matched, N sites checked, image at 0x…` | present; N is every site in `builds.h` (13 at Phase 2, 14 from Phase 3) |
| Registration | `Inspector registered Inspector_native at …s, glClear call …` | present once; no `lua_State changed` line |
| The table | `INSPECTOR_T 1 native table` | `table` |
| `Version` | `INSPECTOR_T 1 version <n> 2.7.3 arm64` | `<n>` is the native API version: 1 at Phase 2, 2 from Phase 3 |
| `Root` | `INSPECTOR_T 1 root 0x…` | an address, not `nil` |
| `Read` of a pointer | `INSPECTOR_T 1 vtable 0x…` | an address, not `nil`; the same in run 2 |
| `Read` of a string | `INSPECTOR_T 1 cstr string` | `string` |
| `ReadBlock` | `INSPECTOR_T 1 block 0x40` | 64 bytes |
| A bad address | `INSPECTOR_T 1 bad nil` and `INSPECTOR_T 1 badblock nil` | `nil`, and the game kept running |
| A bad kind | `INSPECTOR_T 1 badkind nil` | `nil` |
| The script finished | `INSPECTOR_T 1 done ok` | `ok`, not `error …` |

The run records the `u8` and `i32` lines without judging them: they are the first bytes of the same
object.

The run records one more value that is not a pass condition. EEex's headers describe `CBaldurChitin` as a
class with virtual functions, so its first 8 bytes should be a vtable pointer. Then the `vtable` value
minus the image address from the build line falls in `__DATA_CONST,__const` (`0x74c440` to `0x791db0`),
the only constant section of the game that holds pointers. If it does, that is evidence `Root` returns
the right object; if not, the delivery note says so and Phase 3 looks closer.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-06 | `37cccc3` | Incomplete: the console opens only in a loaded game and takes no pasted text, so the tester could not follow the typed steps; the build check and registration passed | [Bridge](../notes/2026-11-06-bridge.md) |
| 2026-11-06 | `37cccc3`, revised test uncommitted | Incomplete: run 1 passed every check after loading a save; the party died before the area change | [Bridge](../notes/2026-11-06-bridge.md) |
| 2026-11-06 | `20cfac2` | Passed: both runs of the script, after loading and after an area change | [Bridge](../notes/2026-11-06-bridge.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a reader can match a Runs row to
the version of the test that judged it; the delivery notes hold the exact lines each run logged.

| Date | Commit | What changed | Criteria for runs before it |
| --- | --- | --- | --- |
| 2026-11-06 | `20cfac2` | Steps: `test/lua/a7xt.lua`, loaded with `Infinity_DoFile`, calls the four functions in a loaded game, instead of typed console lines at the main menu | the first run tried the typed steps |
| 2026-11-06 | `44365b0` | Pass criteria: the build line counts every site (14 from Phase 3) and `Version` reports the current native API version (2 from Phase 3) | 13 sites and version 1, the Phase 2 values |
| 2026-11-15 | the commit that renames `A7X` before v0.1.0 ([first-release plan](../plans/2026-11-15-first-release.md#the-name)) | Names only, every check the same: the native table `A7X_native` is `Inspector_native`, the script `inspt.lua` (`Infinity_DoFile("inspt")`), its lines `INSPECTOR_T`, the library's lines `Inspector …`, and the library `build/inspector.dylib` | the same steps under the names `A7X_native`, `a7xt`, `A7XT`, `A7X …` and `build/a7x.dylib` |
