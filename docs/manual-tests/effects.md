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
([docs/re-notes.md](../re-notes.md#engine-structures)). The probe script reads both lists for every
party member through the walker (`INSPECTOR_WALK.effects`) and logs each effect's fields, then the engine's
own `characters[id].statusEffects`, the status icons the record screen lists, keyed by icon number.
It is the [effect-list plan](../plans/2026-11-15-effect-list.md)'s presence gate: every icon an
effect shows through opcode 142 must be one the record screen lists.

The tester copies the walker's Lua (`inspoff.lua`, `inspwalk.lua`), the JSON writer (`inspjson.lua`)
and the probe (`inspeff.lua`) into the game's `override/` folder for the session. In the game, the
tester types only `Infinity_DoFile("inspeff")`. Results go to the session log; the game shows a one-line
summary.

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

  Step 7 removes them again at the end.
- **A save with a party of two or more who can cast** a few spells with a duration and a status
  icon, such as Bless, Blur, Armor, Haste or Protection from Evil, in a quiet place.
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
3. **Cast** (3 minutes), with the game running. Cast two or three spells on party members, at least
   one on someone other than the caster, and drink a potion if one is at hand. Note each spell and
   whom it is on. Let every spell finish: its icon appears on the target's portrait. Pause only
   then; a spell paused mid-cast never lands, and the run cannot find it.
4. **Open every party member's record screen** once (2 minutes), after loading the save and before
   the probe, so the engine fills `characters[id]` for each; a member whose record screen stayed
   closed fails the gate. Note the icons each portrait shows.
5. **Run the probe** (1 minute). Open the console with Ctrl+Space, type `Infinity_DoFile("inspeff")`
   and press Enter. The message window shows `Inspector effect probe 1: <n> members, <n> effects read,
   0 skipped`. Close the console.
6. **Quit from the game's own menu.**
7. **Remove the four files**, and the `override/` folder if it is now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/inspoff.lua" "$G/override/inspwalk.lua" "$G/override/inspjson.lua" \
     "$G/override/inspeff.lua"
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

- stutter, or a freeze right after `Infinity_DoFile("inspeff")`;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 8 has printed its result, with the spells cast on whom and the icons noted in
step 4. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `Inspector build 2.7.3 arm64 matched, 14 sites checked` and `Inspector registered Inspector_native` | both present, no `Inspector disabled` |
| The probe ran | the message window, step 5 | the summary line, 0 skipped |
| Both lists read to their end | `deno task verify` | no member with a list that stopped on a bad pointer or at the node cap |
| The fields look like an effect's | `deno task verify` | every opcode under 1000, every timing mode one IESDP lists, every source a resource name |
| The presence gate | `deno task verify` | every member has record screen data, and every icon an opcode-142 effect shows (parameter 2) is in its `statusEffects`; `verify: effect probe passed` |
| The spells cast | step 3 and `deno task verify` | each spell cast is a source on its target's timed list, by name (or "part of" its name) |
| No Lua errors | the session log | no `LUA ERROR` line |

`deno task verify` prints an icon the record screen lists without an opcode-142 effect with its
text, and does not fail it: the engine shows some icons from other opcodes (92, "Spell Sequencer
Active", with Spell Sequencer).

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-15 | `9d07cb4`, local changes (effect-lists, the probe) | Passed: 6 members, 862 effects, every field plausible. `+0x49a0` is the equipped list (every effect timing mode 2, every source an item) and `+0x49f0` the timed list (the spells' and abilities' effects, timing modes 1, 7, 9 and 4096). Enhanced Bard Song (`SPCL920A`) and Neera's `OHNSHLDX` on all six, Enrage (`SPCL321`) on the second, Spell Trigger (`SPWI809`) on the sixth, each with its icon effects (opcode 142). `statusEffects` read as none for every member: the probe read only a list | [the effect list](../notes/2026-11-15-effect-list.md) |
| 2026-11-15 | `9d07cb4`, local changes (as above, the probe logging `statusEffects` whatever its shape, names in `verify`) | Passed: 6 members, 863 effects, every field plausible. `statusEffects` uses icon numbers as keys, each entry an icon image, frame and strref; filled for the last three members only, the first three skipped as not populated. For those three, `statusEffects` listed every icon an opcode-142 effect shows (parameter 2), and the only icon it listed without one was 92, "Spell Sequencer Active", from Spell Sequencer (`SPWI710`). Mirror Image (`SPWI212`) found on the sixth member | [the effect list](../notes/2026-11-15-effect-list.md) |
| 2026-11-15 | `95bc5b5`, local changes (the walker's effect lists, the gate) | Gate passed, spells not exercised: all six members with record screen data, 782 effects through the walker, every field plausible, every icon an opcode-142 effect shows listed in `statusEffects` and no other icon listed. The tester paused the spells mid-cast and they never landed, so only Enhanced Bard Song (`SPCL920A`) and `OHNSHLDX` were on the timed lists; step 3's wording was at fault | [the effect list](../notes/2026-11-15-effect-list.md) |
| 2026-11-15 | `95bc5b5`, local changes (as above, step 3 reworded) | Passed: all six members with record screen data, 927 effects through the walker, every field plausible, every icon an opcode-142 effect shows listed. The spells cast, each found by name on its targets' timed lists, as the tester confirmed: Haste and Protection From Evil, 10' Radius on all six, Improved Haste on the second, Mirror Image on the sixth. Listed without an opcode-142 effect: icon 110, "Improved Haste" | [the effect list](../notes/2026-11-15-effect-list.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a reader can match a Runs row to
the version of the test that judged it.

| Date | Commit | What changed | Criteria for runs before it |
| --- | --- | --- | --- |
| 2026-11-15 | the commit that adds this test, after the first run | The probe logs `statusEffects` whatever its shape, and the keys of `characters[id]`; step 8 prints each list grouped by source, with the names the game shows | `statusEffects` read as a list; every effect printed on its own line, sources as resrefs only |
| 2026-11-15 | the commit that adds the walker's effect lists, after the second run | The probe reads through the walker; step 4 requires every record screen opened; the presence gate and the spells cast become pass criteria | no gate: the fields' plausibility only, the probe reading the lists itself |
| 2026-11-15 | the same commit, after the third run | Step 3 says to let every spell finish before pausing: in the third run the tester paused the spells mid-cast and they never landed | step 3 as "wait until each shows its icon, then pause" |
| 2026-11-15 | the commit that renames `A7X` before v0.1.0 ([first-release plan](../plans/2026-11-15-first-release.md#the-name)) | Names only, every check the same: the files take the prefix `insp` (`inspoff.lua`, `inspwalk.lua`, `inspjson.lua`, `inspeff.lua`, `Infinity_DoFile("inspeff")`), the lines `INSPECTOR_EFF`, and the summary and the library's lines `Inspector …` | the same steps under the names `a7x…`, `A7XEFF` and `A7X …` |
