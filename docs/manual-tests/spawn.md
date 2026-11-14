---
type: manual-test
title: "Spawn check"
description: "One play session on a save that is not saved again: the spawn script creates four known creatures with the engine's console and logs what the walker reads for each; deno task verify compares every value with the creature's .cre file. The gate for showing enemy stats."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Spawn check

This session checks the walker on creatures outside the party, whose stats the engine never shows.
The spawn script creates four creatures with the engine's own console (`C:CreateCreature`, the call
the stock cheat menu uses): `COWH`, `DRBOD`, `DADROW8` and `SHFIRE`, chosen because their `.cre`
files hold no items and no effects, so nothing they carry changes their stats. For each one in the
area on screen, the script logs what the walker reads, and `deno task verify` compares max HP, AC and
its modifiers, THAC0, the saves, the resistances, magic resistance and EA with the `.cre` file in the
game. AC is compared as the engine computes it: the file's AC plus the Dexterity adjustment in the
game's `DEXMOD.2DA`. The project shows no enemy stats until every value matches (the
[gate](../README.md#terms) for showing them). It also confirms facts found from the game's code, listed
in [the plan](../plans/2026-11-13-spawn-harness.md#analysis-done-in-plan-mode-read-only): how
`C:CreateCreature` behaves, and where a creature keeps the name of its `.cre` file.

**Spawning changes the game.** Load a save you do not mind losing the state of, and quit without
saving: the four creatures would otherwise stay in that save.

The walker's Lua (`a7xoff.lua`, `a7xwalk.lua`) and the spawn script (`a7xspawn.lua`) are copied into
the game's `override/` folder for the session. In the game, the only thing typed is
`Infinity_DoFile("a7xspawn")`. Results go to the session log; the game shows a one-line summary each
time the script runs.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The three files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/a7xoff.lua mod/inspector/lib/a7xwalk.lua test/lua/a7xspawn.lua "$G/override/"
  ```

  They are removed again at the end (step 7).
- **A save in a quiet place, with open ground near the party**: no fight, nothing hostile in view.
  The four creatures are neutral (EA 128), but a cow in the middle of a battle tells nobody anything.
- **About 15 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `play` shows the library's lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64
   matched, 14 sites checked` and `A7X registered A7X_native`.
2. **Load the save** (1 minute), and note the difficulty setting from the game's options; it is
   recorded with the run.
3. **Spawn and read** (2 minutes). Pause the game with the space bar. Move the pointer over open
   ground near the party. Open the console with Ctrl+Space, type the line below, press Enter, and
   close the console with Ctrl+Space:

   ```lua
   Infinity_DoFile("a7xspawn")
   ```

   The message window shows one line, such as `A7X spawn check 1: spawned 4, found 4 of 4 (details in
   the session log)`, or what is missing, or `A7X spawn check 1 could not run: <reason>`. Note where
   the creatures appeared: at the pointer, beside the party, or elsewhere. No line means the script
   did not load: check that the three files are in `override/`.
4. **Let the game run, then read again** (2 minutes). Unpause for about three seconds, pause again,
   and run the same line. The summary says `A7X spawn check 2: spawned earlier, found 4 of 4`, or
   fewer if one has left the area. The first reading is the one judged, because a `.cre` describes a
   creature as it is spawned; this one shows what the game changes once it runs, such as a fight.
5. **Quit without saving**, from the game's own menu, not with Ctrl+C. `play` prints its summary and
   exits.
6. **Check the save was not changed**, if in doubt: load it again later; the four creatures must not
   be there.
7. **Remove the three files**, and the `override/` folder if it is now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" "$G/override/a7xspawn.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
8. **Judge the run:**

   ```sh
   deno task verify
   ```

   It reads the newest session log and the four `.cre` files from the game, and prints, for the run
   that spawned, every compared field of every creature found and where the engine's copy of each
   `.cre` header differs from the file, then what changed by the later run. If the newest log is a
   session without the check (say, loading the save again for step 6), name the log:
   `deno task verify logs/session-<date>-<time>.log`.

## What to watch for

The walker only reads; the spawning is the engine's own. Stop and quit if you see:

- stutter, or a freeze right after running the script;
- a crash.

Then report what you saw and at which step. A fight with the spawned creatures after step 3 does not
spoil the run: the first reading is judged, and the second shows the fight's effects. If step 3 did
not find all four, report it: that run fails.

## Pass criteria

Say "done" when step 8 has printed its result, with the difficulty setting and where the creatures
appeared. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| Every fixture spawned and found | `deno task verify` | four `spawn <resref> ok` lines, and each fixture in the run that spawned |
| Every value equal to the file | `deno task verify` | `verify: spawn check passed, <n> creatures, every field equal to its .cre` |
| No Lua errors | the session log | no `LUA ERROR` line |

A `DIFF` is a finding, not only a failure: the delivery note records the field, both values and the
stats block read (`block=`), and the rule behind it, an engine adjustment or a walker mistake, is
settled before anything is fixed. The header differences printed for each creature are evidence for
later work, not a pass condition.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-13 | `bc17e13`, local changes | Failed: all four spawned and found at the first reading; `MUMFIG01` died or vanished before the second, the one then judged; every field equal except `DADROW8`'s AC, 6 against 10, the engine's Dexterity adjustment from `DEXMOD.2DA`. Re-judged with that rule, the first reading passes | [Spawn harness](../notes/2026-11-13-spawn-harness.md) |
| 2026-11-13 | `bc17e13`, local changes | Passed on the first reading, the criterion adopted after this run: four creatures, 96 fields, every one equal to its `.cre`. As the test then stood it failed: the tester attacked the creatures between the readings, and the second showed three at 0 HP and `DADROW8` at EA 255 | [Spawn harness](../notes/2026-11-13-spawn-harness.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a Runs row can be read against the
version of the test it was judged by.

| Date | Commit | What changed | Runs before it were judged against |
| --- | --- | --- | --- |
| 2026-11-13 | the commit that adds the spawn check, after the first run | The second fixture is `DRBOD` instead of `MUMFIG01`, which died or vanished between the two readings; `verify` compares AC as the file's plus the `DEXMOD.2DA` Dexterity adjustment | `MUMFIG01` as a fixture, and AC compared with the file's AC alone |
| 2026-11-13 | the same commit, after the second run | The reading taken straight after spawning is judged, not the second; later readings are printed with what changed since; a fight with the spawned creatures is no longer a reason to stop | the second reading judged, which the tester's attack had changed (three creatures at 0 HP, one turned hostile) |
