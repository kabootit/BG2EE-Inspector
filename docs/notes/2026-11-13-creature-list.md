---
title: "Phase 3, the creature list: Delivery Notes"
description: "The walker lists every creature in the area on screen: the object array scanned in 4 KB blocks, each sprite kept when its area (+0x18) is the visible one, and grouped by EA as friendly, neutral or hostile. The creature list manual test passed on its first run, in two areas, with the creatures named on screen listed as hostile."
---

# Phase 3, the creature list: Delivery Notes

> Delivery record for the second part of Phase 3 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/07-walker`, as planned in
> the [creature list plan](../plans/2026-11-13-creature-list.md). It builds on the
> [party walker](2026-11-13-party-walker.md); the evidence for every offset is in
> [docs/re-notes.md](../re-notes.md#engine-structures). Terms such as walker are defined in
> [docs/README.md](../README.md#terms).

## Status

**Manual test passed.** The walker lists the creatures in the area on screen, the whole party among
them, and groups them by EA. Not yet committed; four commits are planned, as in the plan's order of
work, plus the record.

| Piece | State |
| --- | --- |
| Area offsets in `a7xoff.lua` | Done, confirmed in the game |
| `A7XWALK.visible_area`, `creatures`, `ea_group` | Done, with tests against the fake game |
| The list check (`test/lua/a7xlist.lua`) and `deno task verify` for it | Done, with tests |
| [Creature list](../manual-tests/creatures.md) manual test | Passed on the first run (Runs table) |
| `docs/re-notes.md` | The area rows and EA groups, confirmed |
| The spawn harness, which proves enemy values against `.cre` files | Next (`TODO.md`) |

## Plan summary

The party check proved the walker on the party. Showing enemy stats needs the walker to find the other
creatures first: the engine's object array holds every object of every loaded area, so the list keeps
the sprites whose area is the one on screen. The two offsets this needed, a creature's area and the
area on screen, were found in plan mode from the console's `ExploreArea` and the engine sites that
compare the two. Proving enemy values themselves is left to the spawn harness.

## What was built

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `mod/inspector/lib/a7xoff.lua` | `game.areas`, `game.area_count`, `game.visible_area`, `area.resref`, `object.area`, the EA cut-offs |
| `mod/inspector/lib/a7xwalk.lua` | `A7XWALK.visible_area()`, `A7XWALK.creatures(area)` (slots read 256 at a time, never past the highest slot or the capacity), `A7XWALK.ea_group(ea)` |
| `test/lua/a7xlist.lua` | New: the in-game check; `A7XLIST` lines and a summary in the message window |
| `src/verify/list.ts`, `src/tasks/verify.ts` | `deno task verify` judges every run of the list as well as the party check's latest run |
| `test/lua/fakegame.lua` | Two areas, and a crowd past the first 256 slots: a hostile creature, one in the other area, an object that is not a sprite |
| `test/lua/a7xwalk_test.lua`, `test/lua/a7xlist_test.lua`, `test/verify/list_test.ts` | The new functions, the check and its judging |

### Docs

The pages added or changed:

| Page | Change |
| --- | --- |
| `docs/plans/2026-11-13-creature-list.md` | New: the plan |
| `docs/manual-tests/creatures.md` | New: the creature list manual test, and its index row |
| `docs/re-notes.md` | Areas and the one on screen, an area's resref, an object's area, EA groups |
| `docs/manual-tests/walker.md` | The intro no longer says the test settles between two EA candidates |
| `docs/rules/tests.md`, `TODO.md`, foundation plan, `CLAUDE.md`, `docs/README.md` | `a7xlist.lua` as a test file a manual test copies; the spawn harness next; the split; `verify`; links |

## Gotchas worth remembering

- **The object array is sparse and spans every loaded area.** The first run scanned 2,109 slots for 67
  objects, 31 of them sprites, and listed 10; the second scanned 2,520 slots for 96 objects, 29
  sprites, and listed 8. Without the area filter, creatures from areas off screen would be listed.
- **A new area takes a new entry.** The area on screen was entry 0, then entry 1 after the area
  change, so the index has to be read each time, not assumed to be 0.
- **The game's Lua has no `os.clock`.** Both runs logged `ms=-`, so the scan's time in the game is not
  known; no stutter was reported. Timing it would need the native library or the game's own clock.
- **One id per creature for the session.** The party had the same six ids in both runs, in both
  areas.

## Verification

Run on 2026-11-13:

- **`deno task lint`**: fmt, lint, type-check, 102 Deno tests (102 passed), `test:native` (2 of 2),
  `test:lua` (4 of 4 files), `lint:docs` (48 files) and `lint:security` with no findings.
- **The list check against the fake game, end to end:** run in stock Lua 5.2.4 in two areas, its log
  judged by `deno task verify`: run 1 passed; run 2, with the party left in the other area, failed
  naming both members, and `verify` exited 1.
- **Security, by the security-audit procedure's questions:** Lua only, read-only through
  `A7X_native`; each block read is at most 4 KB and the scan stops at the array's capacity, at most 128
  blocks; no change to `native/` or to any permission.
- **The [creature list](../manual-tests/creatures.md) manual test**, against `f8c4fbd` with local
  changes: passed. Session log of 433 lines, `A7X build 2.7.3 arm64 matched, 14 sites checked` and
  `A7X registered A7X_native at 0.5s`, no `A7X disabled` and no `LUA ERROR`; the only `ERROR` lines are
  the baseline missing `dialogf.tlk` and music files, and no home path appears.

  | Run | Area | Scan | Listed | Checks |
  | --- | --- | --- | --- | --- |
  | 1 (20:41) | `AR4000`, index 0 | 2,109 slots, 67 objects, 31 sprites | the party of six (friendly); Illasera and three Black Reavers (hostile, EA 255) | 15 of 15 ok |
  | 2 (20:48) | `AR4500`, index 1 | 2,520 slots, 96 objects, 29 sprites | the party of six (friendly); Cespenar and Sarevok (neutral, EA 128) | 15 of 15 ok |

  The tester named Illasera and three Black Reavers from step 3; all four are in run 1's list, as
  hostile. No problems in play were reported.

### Still to check by hand

1. **A creature that is dead, invisible or charmed**: none was in either list, so how each appears
   (listed or not, and in which group) is not yet known. The spawn harness can set these up.

## Follow-ups

- **The spawn harness** (`TODO.md`): spawn a known creature and compare the walker's values with its
  `.cre` file, which is what proves enemy values.
- **The three unexercised walker branches** from the [party walker](2026-11-13-party-walker.md): the
  temp stats block, improved invisibility, an empty weapon slot.
