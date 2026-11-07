---
type: manual-test
title: "Bridge"
description: "One play session with the Phase 2 bridge loaded: the library checks every engine site, registers A7X_native into the game's Lua, and a test script run from the debug console calls its four read functions in a loaded game and again after an area change. The gate for Phase 2."
duration: "about 10 minutes, 6 of them in the game"
---

# Manual test: Bridge

This session checks the Phase 2 bridge in the game. It shows whether the library accepts this build
(every engine function and anchor hashes as `native/builds.h` expects), registers the `A7X_native` table
once Lua is idle, and whether the four functions in it return what they should when called from the
game's own Lua. The functions only read, so the game should look and play exactly as usual. What the
bridge is and why it registers this way: [ADR-0005](../adr/0005-dyld-interposing-hook.md); the
functions themselves: [ADR-0002](../adr/0002-read-only-bridge-lua-walker.md#native-bridge).

The calls come from a test script, `test/lua/a7xt.lua`, copied into the game's `override/` folder for
the session. The debug console opens only in a loaded game, does not accept pasted text, and takes
one line at a time, so the only thing typed is `Infinity_DoFile("a7xt")`, which loads and runs the
script; BG2EE-GameLog loads its tap the same way. Each run of the script writes numbered `A7XT` lines
to the session log; nothing appears on screen.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is on the commit under test**, with a clean `git status`. `git log -1 --oneline` names
  it; that is the commit the Runs row records.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
  `deno task doctor` reports it; edit it only while the game is closed.
- **The test script is in the game's `override/` folder.** From the repo folder:

  ```sh
  mkdir -p "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override"
  cp test/lua/a7xt.lua "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override/"
  ```

  It is removed again at the end (step 7).
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
   library's own lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64 matched` and, within
   a second, `A7X registered A7X_native`.
2. **Main menu, 30 seconds.** Nothing to do: the registration line should already be there.
3. **Load the save, then run the script** (1 minute). Open the console with Ctrl+Space, type the line
   below, press Enter, and close the console with Ctrl+Space:

   ```lua
   Infinity_DoFile("a7xt")
   ```

   This is run 1.
4. **Play, 2 minutes.** Walk around; open the inventory once.
5. **Change area** through an exit or a building door, then run the script again the same way
   (1 minute). This is run 2.
6. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.
7. **Remove the test script**, and the `override/` folder if it is now empty:

   ```sh
   rm "$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition/override/a7xt.lua"
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

Say "done" when `play` has exited. The newest `logs/session-<stamp>.log` is then read for the
library's lines, which start with `A7X`, and the script's, which the engine writes inside its own log
lines (`… INFO: LUA: A7XT 1 native table`). To see both: `grep 'A7X' logs/session-<stamp>.log`.

The run passes when every line below appears as described, for both runs of the script (`A7XT 1 …` and
`A7XT 2 …`), there is no `A7X disabled` line and no `LUA ERROR`, and the game played normally:

| Check | Log line | Pass when |
| --- | --- | --- |
| Build and sites | `A7X build 2.7.3 arm64 matched, 13 sites checked, image at 0x…` | present |
| Registration | `A7X registered A7X_native at …s, glClear call …` | present once; no `lua_State changed` line |
| The table | `A7XT 1 native table` | `table` |
| `Version` | `A7XT 1 version 1 2.7.3 arm64` | exactly this |
| `Root` | `A7XT 1 root 0x…` | an address, not `nil` |
| `Read` of a pointer | `A7XT 1 vtable 0x…` | an address, not `nil`; the same in run 2 |
| `Read` of a string | `A7XT 1 cstr string` | `string` |
| `ReadBlock` | `A7XT 1 block 0x40` | 64 bytes |
| A bad address | `A7XT 1 bad nil` and `A7XT 1 badblock nil` | `nil`, and the game kept running |
| A bad kind | `A7XT 1 badkind nil` | `nil` |
| The script finished | `A7XT 1 done ok` | `ok`, not `error …` |

The `u8` and `i32` lines are recorded, not judged: they are the first bytes of the same object.

One more value is recorded but is not a pass condition. EEex's headers describe `CBaldurChitin` as a
class with virtual functions, so its first 8 bytes should be a vtable pointer. Then the `vtable` value
minus the image address from the build line falls in `__DATA_CONST,__const` (`0x74c440` to `0x791db0`),
the only constant section of the game that holds pointers. If it does, that is evidence `Root` returns
the right object; if not, the delivery note says so and Phase 3 looks closer.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-06 | `37cccc3` | Incomplete: the console opens only in a loaded game and takes no pasted text, so the typed steps could not be followed; the build check and registration passed | [Bridge](../notes/2026-11-06-bridge.md) |
| 2026-11-06 | `37cccc3`, revised test uncommitted | Incomplete: run 1 passed every check after loading a save; the party died before the area change | [Bridge](../notes/2026-11-06-bridge.md) |
| 2026-11-06 | `20cfac2` | Passed: both runs of the script, after loading and after an area change | [Bridge](../notes/2026-11-06-bridge.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a Runs row can be read against the
version of the test it was judged by; the delivery notes hold the exact lines each run logged.

| Date | Commit | What changed | Runs before it were judged against |
| --- | --- | --- | --- |
| 2026-11-06 | `20cfac2` | Steps: the four functions are called by `test/lua/a7xt.lua`, loaded with `Infinity_DoFile`, in a loaded game, instead of typed console lines at the main menu | the first run tried the typed steps |
