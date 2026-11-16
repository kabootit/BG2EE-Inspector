---
type: manual-test
title: "Effect duration"
description: "One play session with the walker's Lua and the effect probe copied into override/: a spell cast on a party member, the probe run twice with the game paused and once the moment the spell's icon leaves the portrait; deno task verify checks that the game's clock stood still while paused, that each effect's expiry is its spell file's duration at 15 game ticks a second, and that the icon left when its effect expired. The duration gate for time remaining (Phase 5, part 2)."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Effect duration

This session checks, in the game, what part 2 of Phase 5 needs before the inspector shows a
countdown ([time-remaining plan](../plans/2026-11-15-time-remaining.md)):

- **The game's clock** is `CInfGame +0x3fa0`, the field `Infinity_GetGameTicks` multiplies
  (`deno task re game-clock`, [docs/re-notes.md](../re-notes.md#engine-structures)), and it stands
  still while the tester has the game paused.
- **The rate:** an effect with timing mode 4096 holds its expiry on that clock, and expiry minus the
  time the engine applied it is the spell file's duration at 15 game ticks a second.
- **Removal:** the effect leaves the list when the clock reaches its expiry, and the spell's icon
  leaves the portrait with it, so a countdown that reaches zero means the spell is gone.

The probe is the [Effect presence](effects.md) test's (`inspeff.lua`), run three times: twice with the
game paused, then the moment a spell's icon goes. `deno task verify` judges the session's last three
runs. The last run also faces the presence gate, so the steps open every record screen first; the
spell's icon has gone by the last run, so casting after them does not trouble that gate.

The tester copies the walker's Lua (`inspoff.lua`, `inspwalk.lua`), the JSON writer (`inspjson.lua`)
and the probe (`inspeff.lua`) into the game's `override/` folder for the session. In the game, the
tester types only `Infinity_DoFile("inspeff")`, three times. Results go to the session log; the game
shows a one-line summary after each run.

This first run is a probe run, as in part 1: where the data contradicts a check (Enhanced Bard
Song's repeated effects, or a spell whose duration the engine sets in its own way), the check
changes from what the run shows before the gate run.

## Before you start

- **The game is not running.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The game has no WeiDU component installed**, so nothing has called `I` in the session (the
  [manual tests' README](README.md#how-a-run-goes)); `deno task install-mod --uninstall` if it has.
- **The four files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/inspoff.lua mod/inspector/lib/inspwalk.lua mod/inspector/lib/inspjson.lua \
    test/lua/inspeff.lua "$G/override/"
  ```

  Step 10 removes them again at the end.
- **A save with a party member who can cast Bless or Haste**, in a quiet place. Bless's icon lasts
  36 seconds at every level, Haste's 48 to 138 seconds. Both show their icon through an opcode-142
  effect, which the removal check watches; Blur and Mirror Image show theirs through other opcodes,
  and a longer spell (Spirit Armor, 10 minutes) outlasts the step.
- **About 15 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   Expect `Inspector loaded`, `Inspector build 2.7.3 arm64 matched, 14 sites checked` and
   `Inspector registered Inspector_native`.
2. **Load the save** (1 minute).
3. **Open every party member's record screen** once (2 minutes), before casting, so the engine fills
   `characters[id]` for each; the last run's presence gate needs it.
4. **Cast** (1 minute), with the game running. Cast Bless or Haste on a party member and note the
   spell and whom it is on. The moment its icon appears on the target's portrait, pause with Space:
   Bless lasts only 36 game seconds.
5. **Run the probe, still paused** (1 minute). Open the console with Ctrl+Space, type
   `Infinity_DoFile("inspeff")` and press Enter. The message window shows `Inspector effect probe 1: <n>
   members, <n> effects read, 0 skipped`. Close the console.
6. **Wait, still paused, and run it again** (1 minute). Leave the game paused for about 20
   seconds, then run the probe as in step 5: `Inspector effect probe 2: …`. Close the console.
7. **Watch the icon** (1 to 3 minutes). Unpause and watch the target's portrait. The moment the
   spell's icon goes, pause, and run the probe as in step 5: `Inspector effect probe 3: …`. Note roughly
   how long after the icon went the game paused. If no icon goes within 3 minutes, the spell lasts
   longer than the test allows: quit, and run the test again with Bless.
8. **Quit from the game's own menu.**
9. **Note the run order** for the Runs row: the spell, its target, and how long step 7's pause came
   after the icon went.
10. **Remove the four files**, and the `override/` folder if it is now empty:

    ```sh
    G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
    rm "$G/override/inspoff.lua" "$G/override/inspwalk.lua" "$G/override/inspjson.lua" \
      "$G/override/inspeff.lua"
    rmdir "$G/override"
    ```

    `rmdir` refuses, harmlessly, if anything else is in the folder.
11. **Judge the run:**

    ```sh
    deno task verify
    ```

    After the presence gate for the last run, it prints the duration summary, with fewer than
    three runs too, and judges the duration gate only with three: each run's clock (and
    `Infinity_GetGameTicks` as a multiple of it), the game ticks per second of real time between
    the last two runs, each spell's effects with how long the game set them to last against what
    the spell file gives, and the icons that went with how long before the last run they expired.

## What to watch for

The probe only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after `Infinity_DoFile("inspeff")`;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 11 has printed its result, with the notes from step 9. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `Inspector build 2.7.3 arm64 matched, 14 sites checked` and `Inspector registered Inspector_native` | both present, no `Inspector disabled` |
| The probe ran three times | the message window, steps 5 to 7 | three summary lines, 0 skipped; `verify` judges the session's last three, so an extra run belongs before step 5, not after it |
| The presence gate | `deno task verify` | `verify: effect probe passed` for the last run |
| The clock | `deno task verify` | every run read it, and the engine applied no effect after it |
| Paused | `deno task verify` | the two paused runs read the same clock, the last a later one |
| The rate | `deno task verify` | every effect checked against its spell file lasts 15 × one of the file's durations in seconds (or a mode-10 duration in ticks), within one second, and `verify` checked at least one effect |
| Removal | step 7 and `deno task verify` | no run lists an effect more than one second past its expiry (the engine removes expired effects creature by creature, a tick or so late), no effect left the list before its expiry, and the spell's icon is among the icons that went, expired at most 10 seconds before the last run; `verify: effect duration passed` |
| No Lua errors | the session log | no `LUA ERROR` line |

`verify` prints the real-time rate (game ticks per second of log time between the last two runs)
without judging it: it includes the pauses, and the frame rate setting changes it. The countdown is
in game seconds, as spell durations are, so it does not depend on that rate.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-15 | `9476e65`, local changes (the probe's clock, the spell-file reader, the duration gate) | Not judged: two runs, no third. Spirit Armor (`SPWI414`) on the first member, set to last 8,999 ticks, its file's 600 seconds, outlasted step 7. What the two runs show: both paused runs read the clock 2,709,980, 35.5 real seconds apart, and `Infinity_GetGameTicks` read 60 × it; all 61 absolute effects matched their spell files within a second: Spirit Armor's 600 and 2 seconds, and the bard song `FJBARDB`'s 100 ticks (timing mode 10). Removal untested | [time remaining](../notes/2026-11-15-time-remaining.md) |
| 2026-11-15 | `9476e65`, local changes (as above, Bless or Haste named) | Failed: no icon went between the last three runs. Bless (`SPPR101`) on all six, set to last 544 ticks (36.3 seconds, its file's 36), showed in run 1 at clock 2,710,618 and expired at 2,710,709, before the paused runs 2 and 3 (2,710,858), so the test's three runs (2 to 4) saw no icon go. The record screens, opened after casting with the game running, had used most of Bless's 36 seconds; step order at fault. Runs 1 and 2 show the removal: Bless listed before its expiry, gone with its icon 149 ticks after it. Paused clock still, 108 effects matched their spell files | [time remaining](../notes/2026-11-15-time-remaining.md) |
| 2026-11-15 | `9476e65`, local changes (as above, record screens first) | Failed on one tick: Bless (`SPPR101`) on all six, cast before run 1. Paused runs 1 and 2 read the clock 2,710,232, 30.2 real seconds apart; run 3 read 2,710,774. All 125 absolute effects matched their spell files: Bless's 36 seconds (544 and 545 ticks), its 2-second visual effect (opcode 215, 34 and 35 ticks), the bard song's 100 ticks. All six Bless icons went, expired 32 and 33 ticks (about 2 seconds) before run 3. The failure: on one member, the visual effect expired at 2,710,231 and both paused runs still listed it at 2,710,232, while another member's copy, expiring on the same tick, was gone. The engine removes expired effects creature by creature; the removal check now allows one second of lag, and the run passes it | [time remaining](../notes/2026-11-15-time-remaining.md) |
| 2026-11-15 | `9476e65`, local changes (as above, with one second of removal lag) | Passed, the gate run. Bless (`SPPR101`) on all six, cast before run 1. Paused runs 1 and 2 read the clock 2,710,065, 31.4 real seconds apart; run 3 read 2,710,621; `Infinity_GetGameTicks` read 60 × the clock in each. All 126 absolute effects matched their spell files: Bless's 36 seconds (544 and 545 ticks), its 2-second visual effect, the bard song's 100 ticks. No run listed an effect past its expiry. All six Bless icons went, expired 41 and 42 ticks (2.7 and 2.8 seconds) before run 3. Presence gate passed for run 3, no `LUA ERROR` | [time remaining](../notes/2026-11-15-time-remaining.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a reader can match a Runs row to
the version of the test that judged it.

| Date | Commit | What changed | Criteria for runs before it |
| --- | --- | --- | --- |
| 2026-11-15 | the commit that adds this test, after the first run | Before you start and step 3 name Bless or Haste, whose icons come from opcode 142, and rule out Blur, Mirror Image and long spells; step 7 says to stop if no icon goes within 3 minutes; `verify` prints the duration summary with fewer than three runs | any spell lasting one to three minutes with an icon, Blur among the examples; the summary only with three runs |
| 2026-11-15 | the same commit, after the second run | The record screens come before casting (step 3), and the game pauses the moment the spell's icon appears (step 4); an extra probe run belongs before step 5 | record screens after casting, with the game running; pause only at step 5 |
| 2026-11-15 | the same commit, after the third run | The Removal check allows an effect to stay listed up to one second (15 ticks) past its expiry, and `verify` prints how many did and by how much | no effect listed past its expiry |
| 2026-11-15 | the commit that renames `A7X` before v0.1.0 ([first-release plan](../plans/2026-11-15-first-release.md#the-name)) | Names only, every check the same: the files take the prefix `insp` (`inspoff.lua`, `inspwalk.lua`, `inspjson.lua`, `inspeff.lua`, `Infinity_DoFile("inspeff")`), the lines `INSPECTOR_EFF`, and the summary and the library's lines `Inspector …` | the same steps under the names `a7x…`, `A7XEFF` and `A7X …` |
