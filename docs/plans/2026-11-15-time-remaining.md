# Plan: Phase 5, active spells, part 2: time remaining (`initial/09-spells`)

> **Status:** approved 2026-11-15. Edited in place until pushed, per
> [working-together.md](../rules/working-together.md). It follows the
> [effect-list plan](2026-11-15-effect-list.md), Phase 5's first part, delivered.

## Context

Part 1 ([delivery note](../notes/2026-11-15-effect-list.md)) proved where a creature's effects live
and what each holds. An effect cast with a duration has timing mode 4096 and holds its expiry as an
absolute game time; part 2 turns that into time remaining. That needs three facts, each proven
before part 3 shows a countdown in `e`:

1. **The game's clock:** where the current game time is, in the same unit as the expiries.
2. **The rate:** how many of those units make one second of game time (the foundation plan's
   "15 ticks per second", from the EEex thread, not yet checked).
3. **Removal:** an effect leaves the list when the clock reaches its expiry, so a countdown reaching
   zero means the spell is gone.

## Analysis done in plan mode (read-only)

The leads, each with the command or file that shows it:

| What | Finding | Evidence |
| --- | --- | --- |
| `Infinity_GetGameTicks` | returns a 32-bit field of `CInfGame` at `+0x3fa0` (the object the walker reaches as `chitin.game`, `+0x10c0`), times a global `m`, times 2 | `deno task re xrefs Infinity_GetGameTicks` gives the registration at `0x3354b8`; the closure at `0x336a68` (`deno task re annotate 0x336a38 0x336aac`) loads `baldur_chitin` (`0x35d70d0`, as in `native/builds.h`), `+0x10c0`, `+0x3fa0`, multiplies by the word at `0x798778` and shifts left by 1 |
| `m` is mutable | `0x798778` lies in `__DATA,__data`, near the users of `"Maximum Frame Rate"`: likely the frame rate setting, so `Infinity_GetGameTicks` divided by 60 holds only at the default | the section table (`otool -l`) |
| The field is the expiries' clock | in the fourth Effect presence run, `Infinity_GetGameTicks` read 739,929,120 = 60 × 12,332,152; every absolute effect's `applied` (`+0x6c`) is below 12,332,152 and its expiry above it | that run's `A7XEFF` lines |
| 15 units a second | expiry minus applied: Protection from Evil, 10' Radius (`SPPR408`, 1 turn a level) 18,004 = 15 × 1,200 + 4; Haste (`SPWI305`) 1,624 = 15 × 108 + 4; Mirror Image (`SPWI212`) 2,070 = 15 × 138 | the same lines; no tooling reads the durations in the `.spl` files yet |

## Design

### The clock, as tooling

- **`deno task re game-clock`** (`src/re/`, in the shape of `effect-lists`): from the string
  `Infinity_GetGameTicks`, its registration and closure, decoded with `arm64.ts`: the root global
  (checked against `builds.h`'s `baldur_chitin`), the two offsets, the multiplier's address and the
  section it lies in, and the shift. A real-data test expects `0x10c0`, `0x3fa0` and `__data`.
- `docs/re-notes.md`: the clock paragraph, static first, then confirmed by the run.

### The walker

- `a7xoff.lua`: `game.time = { 0x3fa0, "u32" }`; `effect.ticks_per_second = 15` (marked unconfirmed
  until the gate passes); `timing_absolute = 4096`.
- `a7xwalk.lua`: `A7XWALK.game_time()` returns the clock or `nil` and a reason;
  `A7XWALK.remaining(e, now)` returns ticks left for an absolute effect (never below 0), `nil` for
  any other timing mode (permanent and equipped effects have no countdown).
- The fake game gains the clock; Lua tests for both functions.

### The probe and the gate

- **The probe** (`test/lua/a7xeff.lua`) adds the walker's game time to its `party` line, beside
  `Infinity_GetGameTicks`; `EffectRun` in `schemas.ts` gains `time`; regenerate the golden file.
- **A spell's effects from its file** (`src/gamefiles/iebinary.ts`): `readSplEffects`, each effect's
  opcode, timing mode and duration in seconds, from the casting effects and every ability.
- **The duration gate**, judged by `deno task verify` over one session's probe runs:

  | Check | Pass when |
  | --- | --- |
  | The clock | in every run, `time` is above every absolute effect's `applied` |
  | The rate | for every absolute effect from a `.spl` with an effect of the same opcode and a duration, expiry minus applied is 15 × one of those durations, within 15 ticks |
  | Paused | two runs with the game paused between them read the same `time` |
  | Removal | no run lists an absolute effect whose expiry is below `time`; an effect listed in one run and gone in a later one expired between them, and the later run's `time` is within 150 ticks (10 seconds, the tester's reaction) of its expiry |

  `verify` prints `Infinity_GetGameTicks` ÷ `time` but does not judge it: it depends on the frame
  rate setting.
- **Manual test `docs/manual-tests/durations.md`, "Effect duration":** cast a spell with a short
  duration (Blur, Mirror Image or Haste); pause; probe (run 1); wait 20 seconds still paused; probe
  (run 2); unpause and watch the target's portrait; pause the moment the spell's icon goes; probe
  (run 3).
- **Game speed:** the countdown is in game seconds, as the spell durations are, so the frame rate
  does not change it; the gate runs at one speed, not two as the foundation plan's Phase 5 gate
  said. `verify` prints the real-time rate (game ticks per second of log time between unpaused
  runs).
- As in part 1, the first run is a probe run: rewrite from it any check the data contradicts (for
  example Enhanced Bard Song's repeated sub-spells, or Time Stop's irregular duration) before the
  gate run.

## Verification

- `deno task lint` on every commit.
- `re game-clock`'s test expects the offsets from the installed game.
- **Effect duration**, run by the tester on the local tree; `deno task verify` judges it.

## Order of work

Commits on `initial/09-spells`, each passing `deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`; `TODO.md`.
2. `re game-clock`, its test, `docs/re-notes.md`.
3. The probe's `time`, `readSplEffects`, the duration checks in `verify`, and the manual test page;
   the tester's first run is the probe run.
4. The walker's clock and `remaining`, the fake game's clock and the Lua tests; the gate rewritten
   from the probe run if needed, then the gate run.
5. The record: Runs rows, delivery note, `TODO.md`.

Part 3 (spell names in the game, `A7X.show`, the record's `effects`) gets its own plan.
