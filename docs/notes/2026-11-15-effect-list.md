---
title: "Phase 5, part 1, the effect list: Delivery Notes"
description: "The first part of Phase 5: a creature's two effect lists found statically with deno task re effect-lists, confirmed in the game by an effect probe, and read by the walker as A7XWALK.effects; each effect keeps the EFF V2.0 file layout. The presence gate passed on the fourth run of Effect presence: every icon an opcode-142 effect shows is one the record screen lists, and the spells cast are found by name. verify names spells and items from the game files."
---

# Phase 5, part 1, the effect list: Delivery Notes

> Delivery record for the first part of Phase 5 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/09-spells`, as planned in
> the [effect-list plan](../plans/2026-11-15-effect-list.md). The engine facts are in
> [docs/re-notes.md](../re-notes.md#engine-structures); the manual test is
> [Effect presence](../manual-tests/effects.md).

## Status

**Manual test passed.** The walker reads a creature's timed and equipped effect lists, each effect's
opcode, parameters, timing mode, duration and source spell, and the presence gate holds for all six
party members. Not yet committed: the walker's effect lists, the gate, and this record.

| Piece | State |
| --- | --- |
| `deno task re effect-lists` | Done, committed |
| The effect probe, `A7XEFF` lines, their schema, golden file and verify module | Done, committed |
| Spell and item names in `verify` (`dialog.tlk`, `.spl` and `.itm` readers) | Done, committed |
| `A7XWALK.effects`, the offsets in `a7xoff.lua`, the fake game's lists | Done |
| The presence gate in `verify` | Done |
| [Effect presence](../manual-tests/effects.md) manual test | Passed on the fourth run (two probe runs, then the gate) |
| Time remaining and its duration gate | Part 2 |
| Spell names in the game, `A7X.show` and the record's `effects` | Part 3 |

## Plan summary

The `e` hotkey printed a creature's stats but not the spells active on it. This part finds where a
creature's effects live on arm64, proves the finding in the game, and gives the walker a bounded way
to read them, with a gate against the engine's own record screen. Nothing in `A7X` changes yet: the
API and the output gain effects once part 2 has proven the time remaining.

## What was built

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `src/re/fields.ts`, `src/re/commands.ts`, `src/tasks/re.ts` | `listFields` and `deno task re effect-lists`: list heads in an object whose elements the engine tests against constants |
| `mod/inspector/lib/a7xoff.lua` | The two list heads, the node layout and the effect fields |
| `mod/inspector/lib/a7xwalk.lua` | `A7XWALK.effects(sprite, "timed" \| "equipped")`: one list's effects in order, every pointer checked, at most 256 nodes, or `nil` and a reason |
| `test/lua/a7xeff.lua` | The effect probe: both lists through the walker, every effect, `statusEffects` and the keys of `characters[id]`, as `A7XEFF` lines |
| `src/model/schemas.ts` | `EffectLine` and `EffectRun`; `test/fixtures/a7xeff.txt` ties the probe to it |
| `src/verify/effects.ts`, `src/tasks/verify.ts` | The probe's runs judged: lists read to their end, fields plausible, the presence gate; each list summarized by source, named from the game files |
| `src/gamefiles/iebinary.ts`, `src/gamefiles/resources.ts` | `readTlk`, `readNameStrrefs`, `openStringTable` and `readName`: the name the game shows for a spell or an item |
| `test/lua/fakegame.lua` | Effect lists built from `a7xoff.lua`'s offsets |
| Tests | `fields_test.ts`, `commands_test.ts`, `arm64_test.ts`, `a7xwalk_test.lua`, `a7xeff_test.lua`, `effects_test.ts`, `schemas_test.ts`, `iebinary_test.ts`, `resources_test.ts` |

### Docs

The pages added or changed:

| Path | Change |
| --- | --- |
| `docs/plans/2026-11-15-effect-list.md` | New: the plan; the gate rewritten for status icons, and the probe run moved before the walker |
| `docs/re-notes.md` | The `effect-lists` command and recipe step; the effect lists and the effect's layout, found statically, then confirmed |
| `docs/manual-tests/effects.md` | New: Effect presence, four runs and three changes |
| `docs/manual-tests/README.md` | Its index row |
| `docs/architecture.md` | The walker reads effect lists |
| `TODO.md` | Phase 5's three parts; the consumer mod moved after Phase 5, with what research found for it |

## Gotchas worth remembering

- **`statusEffects` is keyed by icon number, not a list.** Each entry is `{ bam, current, strRef }`.
  The first probe read it with `ipairs` and found nothing; `pairs` shows it.
- **The gate runs one way.** Every icon an opcode-142 effect shows is listed, but the engine also
  lists icons no opcode-142 effect shows: 92, "Spell Sequencer Active", and 110, "Improved Haste".
  An icon listed without one is printed, not failed.
- **The timed list also holds permanent effects** (timing modes 1, 7 and 9: class, race and kit
  abilities, and parts of spells), beside the absolute ones (4096). Countdowns in part 2 must filter
  by timing mode.
- **One C++ class per opcode:** the vtable pointer in an effect's first 8 bytes differs by opcode.
  The body's own signature at `+0x8` is zeroed, as IESDP says for an effect embedded in a spell.
- **A helper spell has no name of its own.** `SPCL920A` holds Enhanced Bard Song's effects;
  `SPCL920` holds its name. `verify` guesses the parent by dropping the last character and marks the
  guess. Some name strrefs point at unrelated text in `dialog.tlk` (`CDHLYSY2`), shown as found.
- **A spell paused mid-cast never lands.** The third run's spells were paused before they finished,
  so step 3 now says to pause only after every icon appears.
- **`characters[id]` is filled only for a record screen opened since loading.** The second run
  missed three of six; step 4 now requires every record screen.
- **A clue for part 2, not yet a fact:** `Infinity_GetGameTicks` read 742,158,000 while the absolute
  expiries were near 12,369,500, a ratio of 60.0; the expiries are in game ticks if the clock reads
  sixty units a tick. Part 2's duration gate decides.

## Verification

- `deno task lint` passes: format, lint, type check, every Deno, native and Lua test, `lint:docs`,
  `lint:security`.
- `deno task re effect-lists` finds sprite `+0x49f0` (8 walks) and `+0x49a0` (5), each testing the
  element's `+0x10` against opcode numbers; `test/re/fields_test.ts` expects them from the
  installed game.
- **[Effect presence](../manual-tests/effects.md), four runs, 2026-11-15:**
  1. **Probe, passed:** 862 effects for six members, every field plausible at its `EFF V2.0`
     offset; `+0x49a0` the equipped list (timing mode 2, the items worn), `+0x49f0` the timed list.
     `statusEffects` read as none: the probe read only a list.
  2. **Probe, passed:** 863 effects; `statusEffects` keyed by icon number. For the three members
     with record screen data, every opcode-142 icon was listed; Mirror Image found by name.
  3. **Gate passed, spells not exercised** (`session-20261115-023020`): all six members, 782 effects
     through the walker, every opcode-142 icon listed; the spells were paused mid-cast.
  4. **Passed** (`session-20261115-023422`): all six members, 927 effects through the walker, every
     field plausible, every opcode-142 icon listed. Haste and Protection From Evil, 10' Radius on
     all six, Improved Haste on the second, Mirror Image on the sixth, each found by name on its
     targets' timed lists, as the tester confirmed.

### Still to check by hand

1. Time remaining, against a spell's documented duration and its icon going, at two game speeds: part
   2's duration gate.

## Follow-ups

- Part 2: the game's clock, each absolute effect's expiry, the ticks-per-second constant, and the
  duration gate.
- Part 3: spell names in the game, one line per spell in `A7X.show`, the record's optional `effects`
  field, enemies once parts 1 and 2 hold.
- After Phase 5: the example consumer mod (`TODO.md`).
