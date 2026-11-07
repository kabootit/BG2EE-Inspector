---
type: manual-test
title: "Party check"
description: "One play session with the walker's Lua copied into override/: the check script compares, for every party member, what the walker reads from memory with what the engine shows in characters[id], and deno task verify judges the result. The gate for Phase 3 and for showing any enemy stats."
duration: "about 10 minutes, 6 of them in the game"
---

# Manual test: Party check

This session checks the walker against the engine itself. For every party member, the walker reads
name, HP, AC and its four modifiers, THAC0 and the five saves from game memory, and the check script
compares each with `characters[id]`, the table the engine fills for the record screen. The project
shows no enemy stats until every value matches (the [gate](../README.md#terms) for Phase 3). It also
settles which of two candidate offsets holds a creature's live EA. What the walker reads and where
each offset comes from: [docs/re-notes.md](../re-notes.md#engine-structures).

The walker's Lua (`a7xoff.lua`, `a7xwalk.lua`) and the check script (`a7xchk.lua`) are copied into the
game's `override/` folder for the session; the WeiDU component that installs them for good comes in
Phase 4. In the game, the only thing typed is `Infinity_DoFile("a7xchk")`, which loads and runs them.
Results go to the session log; nothing appears on screen.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is on the commit under test**, with a clean `git status`. `git log -1 --oneline` names
  it; that is the commit the Runs row records.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The three files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/a7xoff.lua mod/inspector/lib/a7xwalk.lua test/lua/a7xchk.lua "$G/override/"
  ```

  They are removed again at the end (step 6).
- **A save with a party of two or more**, in a quiet place: no fight, nobody about to cast a spell,
  so the engine has nothing to recompute between the record screen's reading and the walker's.
- **About 10 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `play` shows the library's lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64
   matched, 14 sites checked` and `A7X registered A7X_native`.
2. **Load the save** (1 minute).
3. **Open the record screen for every party member** (2 minutes). Open the character record screen,
   then click each portrait in turn, so the engine fills `characters[id]` for each one. Close the
   record screen.
4. **Run the check** (1 minute). Open the console with Ctrl+Space, type the line below, press Enter,
   and close the console with Ctrl+Space:

   ```lua
   Infinity_DoFile("a7xchk")
   ```

5. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.
6. **Remove the three files**, and the `override/` folder if it is now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" "$G/override/a7xchk.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
7. **Judge the run:**

   ```sh
   deno task verify
   ```

   It reads the newest session log and prints every compared field.

## What to watch for

The walker only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after running the check;
- a crash.

Then report what you saw and at which step. If the check was run before every record screen was
opened, run it again after opening them: `deno task verify` judges only the latest run.

## Pass criteria

Say "done" when step 7 has printed its result. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| Every party member compared, every field equal | `deno task verify` | `verify: passed, <n> members, <fields> fields, all equal`, with `<n>` the party size |
| The live EA | the `A7XWALK` line of each member, `ea_a=` and `ea_b=` | one of the two is 2 for every party member; that one becomes the walker's EA |
| No Lua errors | the session log | no `LUA ERROR` line |

A `DIFF` is a finding, not only a failure: the delivery note records the field, both values, and the
stats block the walker read (`block=` on the `A7XWALK` line), before anything is fixed.

## Runs

No runs yet. Each run adds a row: the date, the commit it ran against, the result, and a link to the
delivery note that records it.
