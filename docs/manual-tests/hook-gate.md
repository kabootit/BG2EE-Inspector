---
type: manual-test
title: "Hook gate"
description: "One play session with the glClear probe loaded, to show the interposed glClear runs every frame on the main thread, after the engine's Lua starts, with idle-Lua moments to register in. The gate for ADR-0005."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Hook gate

This session checks the hook that ADR-0005 depends on. It shows whether the game calls the interposed
`glClear` once a frame, on its main thread, after its Lua has started, and with Lua idle often enough to
register on. The library is the probe in `native/a7x.c`: it only observes and writes nothing, so the game
should look and play exactly as usual. Why this matters, and what happens if it fails:
[ADR-0005](../adr/0005-dyld-interposing-hook.md#the-hook-gate).

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is on the commit under test**, with a clean `git status`. `git log -1 --oneline` names
  it; that is the commit the Runs row records.
- **A save to load.** Any save works. The probe changes nothing, and the session needs no saving.
- **About 15 minutes**, 10 of them playing.

## Steps

Run from the repo folder. The times matter more than the exact actions: the probe writes a count line
about once a minute, so each minute in a step is one data point for it.

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `build` should report `arm64, Signature=adhoc`. `play` names its session log and then waits while
   the game runs. The probe's lines go to that log, not to the screen.
2. **Main menu, 1 minute.** Wait before loading. This shows whether menu screens call `glClear` too.
3. **Load a save.**
4. **Play, 3 minutes.** Walk around. Open the inventory or the character screen once. Fight if a fight
   comes up.
5. **Pause, 1 minute.** Press Space and wait. This shows whether frames are still drawn while paused.
6. **Change area.** Go through an exit or a building door.
7. **Play, 3 minutes** in the new area.
8. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.

## What to watch for

The probe passes every call through, so nothing should differ from normal play. Stop and quit if you see:

- stutter or a lower frame rate;
- black or flickering frames;
- a freeze or a crash.

Then report what you saw and at which step. A failed run still counts, and its log up to that point is
the evidence.

## Pass criteria

Say "done" when `play` has exited. The newest `logs/session-<stamp>.log` is then read for lines starting
with `A7X`. To see them yourself: `grep 'A7X' logs/session-<stamp>.log`.

The run passes when every line below appears, and the game played normally:

| ADR-0005 condition | Log line | Pass when |
| --- | --- | --- |
| 1. Known build | `A7X build 2.7.3 arm64 matched` | present |
| 2. Main thread | `A7X probe: first glClear at …, main thread yes` | present, with no `off the main thread` line anywhere |
| 3. Lua starts | `A7X probe: lua_State set at …` | present |
| 4. Every frame | `A7X probe: N glClear calls in Ts, Lua running during M` | about one a minute while the game is on screen: N rises by about 3600 a minute at 60 frames per second |
| 5. Idle Lua | the same count lines | M below N, so idle frames exist to register on |

The count lines also answer two questions that are not pass conditions: whether the main menu and a
paused game still draw frames (steps 2 and 5).

## Runs

No runs yet. Each run adds a row: the date, the commit it ran against, the result, and a link to the
delivery note that records it.
