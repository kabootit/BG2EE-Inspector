---
type: manual-test
title: "Effect presence"
description: "One play session with the walker's Lua and the effect probe copied into override/: spells cast on party members, then the probe walks each member's two effect lists and logs every effect's fields with the record screen's statusEffects; deno task verify judges whether the fields read where the effect layout puts them. Confirms the effect lists and their layout before the walker reads them (Phase 5, part 1)."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Effect presence

This session checks, in the game, what `deno task re effect-lists` found in the game's code: each
creature has two linked lists of effects, headed at sprite `+0x49a0` and `+0x49f0`, and each effect
probably keeps the layout of an effect file (`EFF V2.0`), its opcode at `+0x10`
([docs/re-notes.md](../re-notes.md#engine-structures)). The probe script walks both lists for every
party member and logs each effect's fields at their file offsets, then the engine's own
`characters[id].statusEffects`, the status icons the record screen lists. It is the first step of the
[effect-list plan](../plans/2026-11-15-effect-list.md)'s presence gate: this run shows which list
holds the spells cast and how `statusEffects` is shaped, and the exact gate is written from it.

The walker's Lua (`a7xoff.lua`, `a7xwalk.lua`), the JSON writer (`a7xjson.lua`) and the probe
(`a7xeff.lua`) are copied into the game's `override/` folder for the session. In the game, the only
thing typed is `Infinity_DoFile("a7xeff")`. Results go to the session log; the game shows a one-line
summary.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The WeiDU component is not installed**, so nothing has called `A7X` in the session (the
  [manual tests' README](README.md#how-a-run-goes)); `deno task install-mod --uninstall` if it is.
- **The four files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/a7xoff.lua mod/inspector/lib/a7xwalk.lua mod/inspector/lib/a7xjson.lua \
    test/lua/a7xeff.lua "$G/override/"
  ```

  They are removed again at the end (step 7).
- **A save with a party of two or more who can cast** a few spells with a duration and a status
  icon, such as Bless, Blur, Armor, Haste or Protection from Evil, in a quiet place.
- **About 15 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   Expect `A7X loaded`, `A7X build 2.7.3 arm64 matched, 14 sites checked` and
   `A7X registered A7X_native`.
2. **Load the save** (1 minute).
3. **Cast** (3 minutes). Cast two or three spells on party members, at least one on someone other
   than the caster, and drink a potion if one is at hand. Note each spell and whom it is on. Wait
   until each shows its icon on the portrait, then pause.
4. **Open each party member's record screen** once (2 minutes), so the engine fills
   `characters[id]`; note the icons each portrait shows.
5. **Run the probe** (1 minute). Open the console with Ctrl+Space, type `Infinity_DoFile("a7xeff")`
   and press Enter. The message window shows `A7X effect probe 1: <n> members, <n> effects read,
   0 skipped`. Close the console.
6. **Quit from the game's own menu.**
7. **Remove the four files**, and the `override/` folder if it is now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" "$G/override/a7xjson.lua" \
     "$G/override/a7xeff.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
8. **Judge the run:**

   ```sh
   deno task verify
   ```

   It prints, for each member, each list grouped by source: the spell or item with the name the
   game shows for it (or, for a helper spell with none, its parent's, marked "part of …?"), how
   many effects, their timing modes, when the absolute ones expire and which icons they show; then
   `statusEffects` and the keys of `characters[id]`; then whether every effect's fields look like
   an effect's. Every effect's raw fields stay in the session log.

## What to watch for

The probe only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after `Infinity_DoFile("a7xeff")`;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 8 has printed its result, with the spells cast on whom and the icons noted in
step 4. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| The probe ran | the message window, step 5 | the summary line, 0 skipped |
| Both lists read to their end | `deno task verify` | no member with a list that stopped on a bad pointer or at the node cap |
| The fields look like an effect's | `deno task verify` | `verify: effect probe passed`: every opcode under 1000, every timing mode one IESDP lists, every resource and source spell a resource name |
| No Lua errors | the session log | no `LUA ERROR` line |

Recorded, not judged in this run: which list holds the spells cast (the timed list) and which the
items' effects (the equipped list); whether each spell's effects name it as their source; how
`statusEffects` is shaped, and whether each icon in it has an opcode-142 effect with that icon in
parameter 2. The presence gate is written from these and added to this page before the next run.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-15 | `9d07cb4`, local changes (effect-lists, the probe) | Passed: 6 members, 862 effects, every field plausible. `+0x49a0` is the equipped list (every effect timing mode 2, every source an item) and `+0x49f0` the timed list (the spells' and abilities' effects, timing modes 1, 7, 9 and 4096). Enhanced Bard Song (`SPCL920A`) and Neera's `OHNSHLDX` on all six, Enrage (`SPCL321`) on the second, Spell Trigger (`SPWI809`) on the sixth, each with its icon effects (opcode 142). `statusEffects` read as none for every member: the probe read only a list | the effect-list delivery note, after the gate run |


### Changes to this test

Each change to the steps or pass criteria after the first run, so a Runs row can be read against the
version of the test it was judged by.

| Date | Commit | What changed | Runs before it were judged against |
| --- | --- | --- | --- |
| 2026-11-15 | the commit that adds this test, after the first run | The probe logs `statusEffects` whatever its shape, and the keys of `characters[id]`; step 8 prints each list grouped by source, with the names the game shows | `statusEffects` read as a list; every effect printed on its own line, sources as resrefs only |
