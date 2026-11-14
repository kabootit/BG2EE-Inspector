---
type: manual-test
title: "Creature list"
description: "One play session with the walker's Lua and the list script copied into override/: the script lists every creature in the area on screen, in two areas, and checks the list against the party; deno task verify judges both runs, and the tester checks by eye that creatures seen on screen are listed with the right group."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Creature list

This session checks that the walker finds the creatures around the party, not only the party. The
list script scans the engine's object array for creatures in the area on screen and groups them by
EA as friendly, neutral or hostile. It then checks the list against what the engine itself provides:
every party member is in it and friendly, no id appears twice, each id leads back to its creature,
and every creature has a name. The tester adds what no script can: creatures seen on screen are in
the list. It also confirms in the game the offsets behind the list, found from the game's code: the
area a creature is in, the area on screen, and an area's name
([the plan](../plans/2026-11-13-creature-list.md#analysis-done-in-plan-mode-read-only)). Terms such as
walker are defined in [docs/README.md](../README.md#terms).

The walker's Lua (`a7xoff.lua`, `a7xwalk.lua`), the JSON writer (`a7xjson.lua`) and the list script
(`a7xlist.lua`) are copied into the game's `override/` folder for the session; the WeiDU component
that installs them for good comes in Phase 4. In the game, the only thing typed is
`Infinity_DoFile("a7xlist")`, which loads and runs them. Results go to the session log; the game
shows a one-line summary each time the script runs.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The four files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/a7xoff.lua mod/inspector/lib/a7xwalk.lua mod/inspector/lib/a7xjson.lua \
    test/lua/a7xlist.lua "$G/override/"
  ```

  They are removed again at the end (step 7).
- **A save in an area with creatures besides the party**, such as a town district, and next to a door
  or exit into another area. Hostile creatures in view are useful but not needed; nothing has to be
  fought.
- **About 15 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `play` shows the library's lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64
   matched, 14 sites checked` and `A7X registered A7X_native`.
2. **Load the save** (1 minute).
3. **Note three creatures** (2 minutes). Hover the pointer over three creatures that are not in the
   party, and write down the name each one shows. Note too whether any creature on screen has a red
   selection circle (hostile).
4. **Run the list** (1 minute). Open the console with Ctrl+Space, type the line below, press Enter,
   and close the console with Ctrl+Space:

   ```lua
   Infinity_DoFile("a7xlist")
   ```

   The message window shows one line, such as `A7X creature list 1: AR1000, 23 creatures (6 party,
   3 hostile, 14 other), all checks ok (details in the session log)`, or `A7X creature list 1 could
   not run: <reason>`. No line means the script did not load: check that the four files are in
   `override/`.
5. **Change area and run it again** (3 minutes). Walk the party through the door or exit into another
   area, wait for it to load, and run the same line again. The summary says `A7X creature list 2`
   and should name a different area.
6. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.
7. **Remove the four files**, and the `override/` folder if it is now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" "$G/override/a7xjson.lua" \
     "$G/override/a7xlist.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
8. **Judge the run:**

   ```sh
   deno task verify
   ```

   It reads the newest session log and prints, for each run of the list, the area, the scan's counts,
   every creature listed and every check.

## What to watch for

The walker only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after running the list;
- a crash.

Then report what you saw and at which step. If the second run was made before the new area finished
loading, run it again: every run is judged, and the record notes which ones count.

## Pass criteria

Say "done" when step 8 has printed its result, with the three names from step 3. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| Both runs pass their checks | `deno task verify` | `verify: creature list run <n> passed` for runs 1 and 2: every party member listed and friendly, no id twice, every id leading back, every name read |
| The area on screen | `verify: creature list areas, in run order` | two different resrefs, each an area code such as `AR1000` |
| Creatures seen on screen | run 1's creature list in `deno task verify` | the three names from step 3 are in it, and every red-circled creature is `hostile` |
| No Lua errors | the session log | no `LUA ERROR` line |

A failed check is a finding, not only a failure: the delivery note records it with the run's area
and scan counts before anything is fixed.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-13 | `f8c4fbd`, local changes | Passed: both runs, 15 checks each, in `AR4000` (10 creatures) and `AR4500` (8); the four creatures named on screen, Illasera and three Black Reavers, listed as hostile | [Creature list](../notes/2026-11-13-creature-list.md) |
| 2026-11-14 | `bc17e13`, local changes (JSON lines) | Passed: both runs, 9 checks each, in `AR0311` and `AR0312` (4 creatures each); the two creatures named on screen, Gaelan Bayle and Arledrian, listed, one in each area; the first area held only one creature outside the party, so three names could not be noted, and no hostile creature was in view | [Data API](../notes/2026-11-14-data-api.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a Runs row can be read against the
version of the test it was judged by.

| Date | Commit | What changed | Runs before it were judged against |
| --- | --- | --- | --- |
| 2026-11-14 | the commit that writes the checks' lines as JSON | Before you start and the last steps: `a7xjson.lua`, the JSON writer, is copied and removed with the others; the script writes its lines as JSON defined in `src/model/schemas.ts`, which `deno task verify` checks | three files copied, and lines written as text |
