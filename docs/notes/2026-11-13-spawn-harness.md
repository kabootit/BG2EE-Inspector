---
title: "Phase 3, the spawn harness: Delivery Notes"
description: "The spawn check creates four known creatures with the engine's console and compares what the walker reads with their .cre files, read in Deno from the game's archives. It passed on its second run: four creatures, 96 fields, every one equal, with AC compared as the engine computes it, the file's plus a Dexterity adjustment from DEXMOD.2DA. Phase 3 is complete."
---

# Phase 3, the spawn harness: Delivery Notes

> Delivery record for the last part of Phase 3 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/07-walker`, as planned in
> the [spawn harness plan](../plans/2026-11-13-spawn-harness.md). It builds on the
> [party walker](2026-11-13-party-walker.md) and the [creature list](2026-11-13-creature-list.md); the
> evidence for every offset is in [docs/re-notes.md](../re-notes.md#engine-structures).
> [docs/README.md](../README.md#terms) defines terms such as walker and gate.

## Status

**Gate passed; Phase 3 is complete.** For creatures outside the party, whose stats the engine never
shows, the walker reads what their `.cre` files give, once the comparison applies the engine's
Dexterity rule for AC. The inspector may now show enemy values. Not yet committed.

| Piece | State |
| --- | --- |
| `.cre`, `chitin.key`, BIFF and 2DA readers (`src/gamefiles/`) | Done, with tests and a real-data test against the game |
| A sprite's `.cre` resref in the walker | Done, confirmed in the game |
| The spawn check (`test/lua/a7xspawn.lua`) and `deno task verify` for it | Done, with tests |
| [Spawn check](../manual-tests/spawn.md) manual test | Passed on the second run (Runs table) |
| `docs/re-notes.md` | The resref, the header copy, the spawned creatures against their files, `C:CreateCreature` |
| Phase 4, the data API and in-game output | Next (`TODO.md`) |

## Plan summary

The party check proved the walker against the record screen, and the creature list proved it finds
the creatures around the party. Neither proved its values for an enemy. The spawn harness does: the
engine's own console object spawns creatures with known files, and `deno task verify` reads those
files from the game and compares. The plan chose the fixtures by scanning the game's 4,735 `.cre`
files for ones with no items and no effects, so that equipment could not change their stats.

## What shipped

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `src/gamefiles/iebinary.ts` | New, adapted from BG2EE-GameLog: KEY, BIFF and CRE readers, the CRE reader extended with AC modifiers, Dexterity, EA and item and effect counts; a 2DA reader |
| `src/gamefiles/resources.ts` | New, adapted from BG2EE-GameLog: `override/` first, then the archives; file access through a `Disk`, so the tests need no files |
| `mod/inspector/lib/a7xoff.lua`, `a7xwalk.lua` | `sprite.resref` (`+0x540`) and the `.cre` header copy (`+0x558`, `0x2d4` bytes); `A7XWALK.resref()`, and `resref` in each creature record |
| `test/lua/a7xspawn.lua` | New: spawns the four fixtures on its first run in a session, then logs each fixture creature's values and header |
| `src/verify/spawn.ts`, `src/tasks/verify.ts` | `deno task verify` judges the spawn check: the run that spawned, each creature against its `.cre`, AC with the `DEXMOD.2DA` adjustment, and what later runs saw change |
| `deno.json` | `verify` may read the game folder and the `BG2EE_*` names, scoped like `doctor` |
| `test/gamefiles/`, `test/lua/a7xspawn_test.lua`, `test/verify/spawn_test.ts`, fake game | The readers on synthetic files and the real game, the check with a fake `C`, the judging |

### Docs

The pages added or changed:

| Page | Change |
| --- | --- |
| `docs/plans/2026-11-13-spawn-harness.md` | New: the plan, with what changed in delivery |
| `docs/manual-tests/spawn.md` | New: the spawn check, changed after each of its two runs (its Changes table) |
| `docs/re-notes.md` | The `.cre` resref, the header copy, spawned creatures against their files, `C:CreateCreature` |
| `docs/rules/tests.md`, `TODO.md`, foundation plan, `CLAUDE.md`, `docs/README.md` | `a7xspawn.lua`; Phase 4 next; `verify` and `src/gamefiles/`; links |

## Gotchas worth remembering

- **The engine adds Dexterity to AC.** `DADROW8`, a drow with DEX 18 and a file AC of 10, read 6;
  `DEXMOD.2DA` gives -4 for 18. `DRBOD`, DEX 24 and file AC 1, then read -5, the table's -6. The
  walker was right; the comparison had to learn the rule.
- **A `.cre` describes a creature as spawned, not as it stays.** `MUMFIG01` matched in every field and
  was gone three seconds later; in the second run the tester attacked the creatures, and the second
  reading showed three dead and one hostile. The check now judges the reading taken straight after
  spawning and prints later changes.
- **The dead stay listed.** Creatures at 0 HP were still in the area's list, with their stats intact.
- **The engine's copy of the header is not the file from `0x270` on.** Up to there it matches except
  for colors; the signature and most bytes from the IDS fields onward differ. Its `0x270` read 224,
  the value the party check found at sprite `+0x7c8` (`0x558 + 0x270`) when it looked for the EA.
- **No suitable script-free creature has a negative resistance.** Among the neutral creatures with
  no items, no effects and one AC, none without a script has one, so only `MUMFIG01`'s first reading
  proves negative values.
- **The `test` task cannot write files**, so `resources.ts` takes a `Disk`: the tests describe a game
  folder in memory instead of building one in a temporary directory.

## Verification

Run on 2026-11-13:

- **`deno task lint`**: fmt, lint, type-check, 117 Deno tests (117 passed), `test:native` (2 of 2),
  `test:lua` (5 of 5 files), `lint:docs` and `lint:security` with no findings.
- **The readers against the game:** the real-data test reads `chitin.key` and finds each fixture as a
  `CRE V1.0` with no items, no effects and one AC; the four fixtures read the same values as the
  plan-mode scan with BG2EE-GameLog's reader. A comparison with IESDP's CRE V1.0 page checked the
  offsets.
- **`deno task verify` end to end** on a scratch log built from the real files, with one value changed
  on purpose: it named that field with both values and the changed header byte.
- **Security:** the native library is unchanged and nothing writes a save; the one game-changing
  action is the engine's own spawn, in a test script never installed, and the test page says to quit
  without saving. `verify`'s new access to the game folder only reads, and its scope is narrow.
- **The [spawn check](../manual-tests/spawn.md)**, two runs, each in its own session against
  `bc17e13` with local changes, at Insane difficulty. Both logs show `A7X build 2.7.3 arm64 matched,
  14 sites checked` and `A7X registered A7X_native`, no `A7X disabled` and no `LUA ERROR`; the only
  `ERROR` lines are the baseline missing `dialogf.tlk` and music files, and no home path appears. All
  four `C:CreateCreature` calls succeeded each time; in the first run the creatures appeared east of
  the party.

  | Run | Fixtures | First reading (judged) | Second reading, about three seconds of play later |
  | --- | --- | --- | --- |
  | 1 (21:25) | `COWH`, `MUMFIG01`, `DADROW8`, `SHFIRE` | all four found; every field equal but `DADROW8`'s AC, 6 against 10, which the Dexterity rule explains; with it, all 96 equal | `MUMFIG01` gone (it died or vanished); the other three unchanged |
  | 2 (22:19) | `COWH`, `DRBOD`, `DADROW8`, `SHFIRE` | all four found; all 96 fields equal, `DRBOD`'s AC with the rule (-5 from a file AC of 1 and DEX 24) | after the tester attacked them: `DRBOD`, `DADROW8` and `SHFIRE` at 0 HP, `DADROW8` at EA 255; `COWH` unchanged |

  Run 1 failed as the test stood then (second reading judged, AC without the rule). Run 2 passed on
  the criterion adopted after it, the first reading; as the test stood during it, its second reading
  would have failed on `DADROW8`'s EA. Both changes are rows in the test's Changes table.

### Still to check by hand

1. **The walker's temp stats block**: every creature in every reading, party and spawned, was on the
   derived block, so only the fake game still tests the temp-block branch.
2. **Improved invisibility and an empty weapon slot**, from the [party walker](2026-11-13-party-walker.md):
   still not met in the game.

## Follow-ups

- **Phase 4** (`TODO.md`): the data API (`a7x_api.lua`, schema 1), its JSON at the boundary, and the
  hotkey and console output. The spawn check now proves enemy values for the fields it compares.
- **Fields not yet proven for enemies**: name (logged by the walker, not compared with `dialog.tlk`),
  current HP beyond the spawned value, and anything the `.cre` header copy holds from `0x270` on.
