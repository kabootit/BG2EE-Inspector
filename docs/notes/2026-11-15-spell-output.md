---
title: "Phase 5, part 3, spells in the output: Delivery Notes"
description: "The third part of Phase 5: e and A7X.show print each creature's active spells by name with their time left in game time, and the record gains the optional effects field. Names come from a table install-mod writes from the game's spell and item files, fetched in the game with Infinity_FetchString. The Spell countdown test passed on its first run, party and enemies both."
---

# Phase 5, part 3, spells in the output: Delivery Notes

> Delivery record for the third and last part of Phase 5 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/09-spells`, as planned in
> the [spell-output plan](../plans/2026-11-15-spell-output.md). [docs/data-model.md](../data-model.md)
> defines the record; the manual test is [Spell countdown](../manual-tests/countdown.md).

## Status

**Manual test passed.** `e` and `A7X.show` print a `Spells` line for every creature, party or not,
and each record carries the same spells as `effects`. Not yet committed: the names table, the
record's `effects`, the spells line, and this record.

| Piece | State |
| --- | --- |
| The names table: `names.ts`, `install-mod` writing `a7xnames.lua`, the tp2 copying and loading it | Done |
| The record's `effects`, the schema, the golden file | Done |
| The `Spells` line in `a7xfmt.lua` | Done |
| `verify`'s check of each record's spells against the game files | Done |
| [Spell countdown](../manual-tests/countdown.md) manual test | Passed on the first run |
| Phase 5 | Done: the effect list, time remaining, and this |

## Plan summary

Parts 1 and 2 proved where a creature's effects live and how long each has left. This part shows
them: one line per creature, every active spell by the name the game shows, soonest to expire first,
in game time; and the same in the record, so another mod can read them.

## What shipped

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `src/gamefiles/names.ts` | New: `ownNameStrref`, `readName` (moved from `resources.ts`), `nameRef` with the parent guess for a nameless helper spell, `nameStrrefs` for every spell and item file, `namesLua` |
| `src/game/install_mod.ts`, `src/tasks/install_mod.ts` | An install builds the names table from the game's files and writes `inspector/lib/a7xnames.lua`; an install without one refuses before writing anything |
| `mod/inspector/inspector.tp2` | Copies `a7xnames.lua` and loads it before `a7x` |
| `mod/inspector/lib/a7xapi.lua` | Keeps `A7XNAMES` private; `effects` in every record: one entry per source of absolute effects, its latest expiry in game seconds rounded up, the name by `Infinity_FetchString` or the resref |
| `mod/inspector/lib/a7xfmt.lua` | The `Spells` line and `A7XFMT.duration` (`34s`, `1m 42s`, `2h 5m`) |
| `src/model/schemas.ts`, `docs/data-model.schema.json` | The optional `effects` field |
| `src/verify/spells.ts`, `src/tasks/verify.ts` | Each record's spell names against the game files, each time against the spell file's longest duration; `verify` uses `nameRef` for the effect probe's names too |
| `test/fixtures/a7xdata.txt` | The fake game's records with `effects` |
| Tests | `names_test.ts`, `install_mod_test.ts`, `tp2_test.ts`, `schemas_test.ts`, `spec_test.ts`, `spells_test.ts`, `a7xapi_test.lua`, `a7xfmt_test.lua`; shared TLK, name-header and in-memory disk builders in `test/gamefiles/fixtures.ts` |

### Docs

The pages added or changed:

| Path | Change |
| --- | --- |
| `docs/plans/2026-11-15-spell-output.md` | New: the plan |
| `docs/data-model.md` | The `effects` field, game seconds, where names come from |
| `docs/api.md` | The `Spells` line in `A7X.show`; `effects` is optional |
| `docs/manual-tests/countdown.md` | New: Spell countdown, one run |
| `docs/manual-tests/hotkey.md` | The install's seventh file, with a Changes row |
| `docs/manual-tests/README.md` | Its index row |
| `docs/architecture.md`, `CLAUDE.md` | The names table in the load sequence, the layout and the tasks |
| `TODO.md` | Phase 5 done |

## Gotchas worth remembering

- **The game has no call that names a spell from its resref**, only `Infinity_FetchString(strref)`.
  The names table holds strrefs, not strings, so the game's own language shows.
- **Strref 0 is `<NO TEXT>`,** a placeholder; the names table skips it as it skips -1.
- **A file the API loads cannot call itself through its global.** The API clears `A7XFMT` after
  loading, so the formatter's `lines` crashed calling `A7XFMT.duration`; it now calls a local. The
  formatter's own test calls through the global and passed; the API's test caught it.
- **The game's Lua is 5.2:** no `//` operator.
- **A spell lasts as long as its longest effect.** Bless's 2-second visual effect stays listed past
  its expiry; the record takes each source's latest expiry, so Bless shows 36 seconds.
- **The bard song has no name anywhere.** `FJBARDB` and its parent `FJBARD` both lack one, so the
  line shows the resref; it refreshes every round, so it reads 1 to 7 seconds.

## Verification

- `deno task lint` passes: format, lint, type check, every Deno, native and Lua test, `lint:docs`,
  `lint:security`.
- The names table from the installed game: 3,844 entries, 86 KB, loaded by the test Lua 5.2 with
  `SPPR101` at 12,089 (Bless) and `SPCL920A` at its parent's 65,599 (Enhanced Bard Song).
- **[Spell countdown](../manual-tests/countdown.md), one run, 2026-11-15**
  (`session-20261115-185434`), passed: Bless on Boom Boom read 33, 27, 21, 16, 11, 8, 5 and 1
  seconds across eight presses of `e`, and the press after its icon went listed none. THAC0 read 11
  while Bless lasted and 12 without it, its +1 to hit. Protection From Evil counted down from 2m
  42s. The Hobgoblin Archer showed Command, which the party cast on it, and the Archer and the Hobgoblin
  Captain showed Bless from the hobgoblins' own priest, as the tester confirmed. `verify` passed 22
  `A7XDATA` lines and 4 sources; no `LUA ERROR`; the uninstall left `override/` empty.

## Follow-ups

- A name for the bard song: no spell file gives `FJBARDB` one.
- After Phase 5: the example consumer mod (`TODO.md`).
