---
title: "Phase 5, part 2, time remaining: Delivery Notes"
description: "The second part of Phase 5: the game's clock found statically with deno task re game-clock, an effect's expiry on that clock at 15 game ticks a second, and removal at expiry, all confirmed in the game. The walker gains A7XWALK.game_time and A7XWALK.remaining; verify checks each effect against its spell file. The duration gate passed on the fourth run of Effect duration."
---

# Phase 5, part 2, time remaining: Delivery Notes

> Delivery record for the second part of Phase 5 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/09-spells`, as planned in
> the [time-remaining plan](../plans/2026-11-15-time-remaining.md). The engine facts are in
> [docs/re-notes.md](../re-notes.md#engine-structures); the manual test is
> [Effect duration](../manual-tests/durations.md).

## Status

**Manual test passed.** The walker reads the game's clock and gives the game ticks left on any
effect with an expiry; the duration gate holds for Bless on all six party members. Not yet
committed: the probe's clock, the spell-file reader, the duration gate, the walker's functions, and
this record.

| Piece | State |
| --- | --- |
| `deno task re game-clock` | Done, committed |
| The passive-voice check in `lint:docs` | Done, committed |
| The probe's clock (`time`, `clock`), `readSplEffects` and `readSpellEffects` | Done |
| The duration gate in `verify` | Done |
| `A7XWALK.game_time`, `A7XWALK.remaining`, the offsets in `a7xoff.lua`, the fake game's clock | Done |
| [Effect duration](../manual-tests/durations.md) manual test | Passed on the fourth run (one run not judged and two failed, then the gate) |
| Spell names in the game, `A7X.show` and the record's `effects` | Part 3 |

## Plan summary

Part 1 found each creature's effects; an effect cast with a duration holds its expiry as an absolute
game time. This part proves the three facts a countdown needs: where the game's clock is, how many of
its ticks make a second, and that an effect leaves its list when the clock reaches its expiry. Nothing
in `A7X` changes yet; part 3 shows the countdown.

## What shipped

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `src/re/clock.ts`, `src/re/arm64.ts`, `src/re/macho.ts`, `src/re/commands.ts`, `src/tasks/re.ts` | `deno task re game-clock`: from `Infinity_GetGameTicks`'s registration, the closure, the pointer chain to the clock field, the multiplier's address and section, and the shift; `multiply` and `shiftLeft` decoders, `cstringAddresses` |
| `mod/inspector/lib/a7xoff.lua` | `game.time` (`+0x3fa0`), `effect.absolute` (4096) and `effect.ticks_per_second` (15) |
| `mod/inspector/lib/a7xwalk.lua` | `A7XWALK.game_time()`: the clock, or `nil` and a reason; `A7XWALK.remaining(e, now)`: ticks left on an absolute effect, never below 0, `nil` for any other timing mode |
| `test/lua/a7xeff.lua` | The probe's party line gains the walker's clock (`time`) and `Infinity_GetClockTicks` (`clock`, real milliseconds) |
| `src/model/schemas.ts`, `src/verify/effects.ts` | The party line's `time` and `clock`, kept on each `EffectRun` |
| `src/gamefiles/iebinary.ts`, `src/gamefiles/resources.ts` | `readSplEffects` and `readSpellEffects`: a spell's effects with opcode, timing mode and duration, from the casting effects and every ability |
| `src/verify/durations.ts`, `src/tasks/verify.ts` | The duration gate over the session's last three runs, and a summary printed with any number of runs |
| `src/lint/docs.ts` | The passive-voice check |
| `test/lua/fakegame.lua` | The game's clock |
| Tests | `clock_test.ts`, `arm64_test.ts`, `macho_test.ts`, `commands_test.ts`, `iebinary_test.ts`, `resources_test.ts`, `durations_test.ts`, `effects_test.ts`, `docs_test.ts`, `a7xwalk_test.lua`, `a7xeff_test.lua` |

### Docs

The pages added or changed:

| Path | Change |
| --- | --- |
| `docs/plans/2026-11-15-time-remaining.md` | New: the plan |
| `docs/re-notes.md` | The `game-clock` command and recipe step; the clock, its rate and removal, found statically, then confirmed |
| `docs/manual-tests/durations.md` | New: Effect duration, four runs and three changes |
| `docs/manual-tests/README.md` | Its index row |
| `docs/rules/declarative-style.md`, `docs/learnings/2026-11-15-generators-for-searching.md` | New: generators and iterator helpers over accumulating loops |
| `docs/rules/writing-style.md` and every page | Active voice, which `lint:docs` now checks |
| `docs/architecture.md` | The walker reads the game's clock |
| `TODO.md` | Part 2 done |

## Changes from the plan

- **`A7XWALK.game_time` moved into step 3:** the probe reads the clock through the walker, so the
  function came with the probe, before the gate run.
- **`verify` prints the duration summary with fewer than three runs**, so a run that stops early
  still shows what it read.
- **Bless or Haste, not Blur or Mirror Image:** the removal check watches an icon that an opcode-142
  effect shows, and Blur and Mirror Image show theirs through other opcodes.
- **Removal allows one second of lag:** the plan said no run lists an effect past its expiry; the
  third run found one listed a tick past it.
- **One game speed:** the countdown is in game seconds, as spell durations are, so the frame rate
  setting does not change it.

## Gotchas worth remembering

- **`Infinity_GetGameTicks` is not the clock.** It returns the clock times a global in
  `__DATA,__data` (30 in the file, likely the frame rate) times 2: 60 × the clock at the default. The
  walker reads the clock field itself.
- **The engine is a few ticks off.** Expiry minus applied is 15 × the spell file's duration in
  seconds, from 1 under to 5 over (Spirit Armor 8,999 for 600 seconds, Bless 544 and 545 for 36,
  Haste 1,624 for 108). The rate check allows one second either way.
- **Timing mode 10 holds ticks, not seconds:** the bard song's `FJBARDB` lasts 100 ticks, its file's
  value as is.
- **The engine removes expired effects creature by creature.** In the third run, Bless's 2-second
  visual effect stayed listed one tick past its expiry on one member while another member's copy,
  expiring on the same tick, was gone. `A7XWALK.remaining` returns 0 for it rather than a negative
  number.
- **The step order decides whether the test sees an icon go.** In the second run, opening six record
  screens after casting used most of Bless's 36 seconds, and Bless expired before the paused runs.
  The record screens now come first.

## Verification

- `deno task lint` passes: format, lint, type check, every Deno, native and Lua test, `lint:docs`,
  `lint:security`.
- `deno task re game-clock` finds `Infinity_GetGameTicks` at `0x3354b8`, its closure at `0x336a68`,
  `baldur_chitin` `+0x10c0` `+0x3fa0`, the multiplier at `0x798778` in `__DATA,__data`, and a shift
  by 1; `test/re/clock_test.ts` expects them from the installed game.
- **[Effect duration](../manual-tests/durations.md), four runs, 2026-11-15:**
  1. **Not judged** (`session-20261115-125115`): two runs, no third. Spirit Armor outlasted the step.
     Both paused runs read the clock 2,709,980, 35.5 real seconds apart; all 61 absolute effects
     matched their spell files.
  2. **Failed** (`session-20261115-130454`): Bless expired before the paused runs, so no icon went
     inside the test's three. Runs 1 and 2 show its removal, 149 ticks after its expiry; 108 effects
     matched.
  3. **Failed on one tick** (`session-20261115-173736`): a visual effect listed one tick past its
     expiry. Everything else passed; 125 effects matched.
  4. **Passed, the gate run** (`session-20261115-174448`): the paused runs read 2,710,065, 31.4 real
     seconds apart, and the third 2,710,621; `Infinity_GetGameTicks` 60 × the clock in each. All 126
     absolute effects matched their spell files; no run listed an effect past its expiry. All six
     Bless icons went, expired 41 and 42 ticks (under 3 seconds) before the third run. Presence gate
     passed, no `LUA ERROR`.

### Still to check by hand

1. The countdown as `e` shows it, against a spell's icon going: part 3.

## Follow-ups

- Part 3: spell names in the game, one line per spell with its time left in `A7X.show`, the record's
  optional `effects` field, enemies.
- After Phase 5: the example consumer mod (`TODO.md`).
