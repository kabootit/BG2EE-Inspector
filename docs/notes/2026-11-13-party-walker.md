---
title: "Phase 3, the party walker: Delivery Notes"
description: "The first mod Lua: a7xoff.lua names the 2.7.3 arm64 offsets and a7xwalk.lua follows them from A7X_native.Root() to each party member's sprite. The party check compares every value with the engine's own characters[id] and passed on its fourth run, 6 members and 120 fields all equal; sprite dumps found the live EA at +0x38."
---

# Phase 3, the party walker: Delivery Notes

> Delivery record for the first half of Phase 3 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/07-walker`, as planned in
> the [Phase 3 plan](../plans/2026-11-06-party-walker.md). The native API it reads through is in
> [ADR-0002](../adr/0002-read-only-bridge-lua-walker.md#native-bridge); the evidence for every offset
> is in [docs/re-notes.md](../re-notes.md#engine-structures). [docs/README.md](../README.md#terms)
> defines terms such as walker, gate and stats block.

## Status

**Gate passed.** For every member of a party of six, the walker's name, HP, AC and its four
modifiers, THAC0, EA and five saves (shown and base) equal what the engine shows in `characters[id]`.
`initial/07-walker` has the first eight commits pushed; the fixes the manual test found are in the
working tree, not yet committed.

| Piece | State |
| --- | --- |
| `deno task re` (`starts`, `xrefs`, `annotate`, `stats`, `compare`, `hash`) | Done, with tests and real-data tests against the installed binary |
| `deno task test:native`, `deno task test:lua` | Done, both in `deno task lint` |
| Object array in `builds.h`, `A7X_native.Objects()` | Done: 14 sites, `Version()` reports 2 |
| `mod/inspector/lib/a7xoff.lua`, `a7xwalk.lua` | Done; EA at `+0x38` from the manual test |
| The party check (`test/lua/a7xchk.lua`) and `deno task verify` | Done; the save-text parse and the sprite dumps from the manual test |
| [Party check](../manual-tests/walker.md) manual test | Passed on the fourth run (Runs table) |
| Every creature: enumeration, area and EA filters, the spawn harness | Next branch (`TODO.md`) |

## Plan summary

Phase 2 put four read-only functions into the game's Lua. Phase 3 is the first Lua that uses them,
and the inspector may show no enemy stat until the walker proves itself on creatures whose values the
engine also shows: the party, through `characters[id]`, the table the record screen draws from. The
plan found the offsets in the function that fills that table (`0x2e24c8`), so each field the walker
reads is one the engine itself reads for the same screen. The plan split the phase: the party walker
and its check on this branch, every creature on the next.

## What shipped

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `src/re/`, `src/tasks/re.ts` | `deno task re`: function starts from `LC_FUNCTION_STARTS`, `adrp` pair decoding, string cross-references, annotated disassembly, the `GetAtOffset` jump table, comparison with stock `lapi.c`, site hashes |
| `src/tasks/test_native.ts`, `test/native/` | The bridge with a fake Lua API; the `lua_State` layout against the vendored `lstate.h` |
| `src/tasks/test_lua.ts`, `src/build/lua.ts` | Stock Lua 5.2.4 built into `build/lua`; runs `test/lua/*_test.lua` |
| `native/builds.h`, `native/a7x.c` | The object array, anchored by the lookup function at `0x1ae26c`; `A7X_native.Objects()`; `Version()` 2 |
| `mod/inspector/lib/a7xoff.lua` | New: the offsets by name (`chitin`, `game`, `objects`, `object`, `sprite`, `stats`) |
| `mod/inspector/lib/a7xwalk.lua` | New: `A7XWALK.lookup(id)`, `party()`, `creature(sprite)`; every pointer range-checked, the type byte checked before any sprite read |
| `test/lua/a7xchk.lua` | New: the in-game check; `A7XCHECK`, `A7XWALK` and `A7XDUMP` lines; a one-line summary in the message window |
| `src/verify/checks.ts`, `src/tasks/verify.ts` | `deno task verify`: judges the latest run in a session log, and lists the offsets that read 2 in every sprite dump |
| `src/lint/security.ts` | `./build/…` run paths allowed |
| `test/lua/`, `test/re/`, `test/verify/` | The fake game and the Lua tests; the `re` and `verify` tests |

### Docs

The pages added or changed:

| Page | Change |
| --- | --- |
| `docs/plans/2026-11-06-bridge.md` | New: the Phase 2 plan, saved afterwards |
| `docs/plans/2026-11-06-party-walker.md` | New: this phase's plan |
| `docs/README.md` | The Terms section; plan and note links |
| `docs/re-notes.md` | Engine structures: the party, the object array, the stats blocks, the `GetAtOffset` table, THAC0, names, saves, EA; the recipe cites `deno task re` |
| `docs/manual-tests/walker.md` | New, then changed after each of the first three runs (its Changes table) |
| `docs/manual-tests/README.md`, `bridge.md`, `hook-gate.md` | A test's page records the changes to it; tests run on the local working tree as it is |
| ADR-0002, `TODO.md`, `CLAUDE.md`, rules | `Objects()` and 8-character names; the next branch; tasks and layout |

## Gotchas worth remembering

- **The live EA was not where the code suggested.** The type-matching code compares two
  `CAIObjectType`s, which put the EA at `+0x30` or `+0x78`; neither read 2 for the party, and the
  `.cre` header's EA read 224 for every member. Dumping the first 2 KB of each party sprite and
  looking for the offsets that read 2 in all six gave exactly one: `+0x38`, the EA byte of the type
  at `+0x30`. `deno task verify` keeps the dump search.
- **The save text is in `characters[id].proficiencies`, not at the top level.** The engine pops `Stats`
  before it sets `savingThrows`, so the key lands in the table then on top of the Lua stack. Logging
  the keys of `characters[id]` and of `proficiencies` settled it.
- **The bracket in the save text is a difference, not a value.** A line reads `Spell: -1 (-7)`: the
  shown save, then how far it is from the base, and the engine leaves the bracket out when that is 0.
  The base is the first number less the second. The first parse read it as "base (shown)", which
  happened to agree for two saves.
- **Object ids change between sessions.** The same party had ids `133695479` onward in the first two
  runs and `134416386` onward in the last two. An id holds only for the session that produced it.
- **`Infinity_DoFile` names are 8 characters at most**, so the game cannot load the foundation plan's
  `a7x_offsets_273_arm64.lua`; the files are `a7xoff`, `a7xwalk` and `a7xchk`.
- **The console shows nothing for a script that ran.** The check now ends with
  `Infinity_DisplayString`, so the message window confirms it ran and gives the totals.

## Verification

Run on 2026-11-13:

- **`deno task lint`**: fmt, lint, type-check, 98 Deno tests (98 passed), `test:native` (2 of 2),
  `test:lua` (3 of 3 files), `lint:docs` and `lint:security` with no findings.
- **The real-data tests** against the installed binary: `re stats` gives id 1 at `+0x4` and id 151 at
  `+0x1f4`; `re xrefs` finds `Infinity_Log`'s registration; every `builds.h` site is a function start
  and hashes as recorded.
- **The [party check](../manual-tests/walker.md)**, four runs with the same party of six, each with
  `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native`, no
  `A7X disabled` and no `LUA ERROR`:
  1. Against `c823b3c`: failed. 54 fields `ok` (name, HP, AC and its modifiers, THAC0 for all six);
     every save `nil` on the engine side; neither EA candidate read 2.
  2. Against `c823b3c` with the dumps added: failed, as expected; the tester ran it for evidence. The dumps
     gave `+0x38`; the logged keys showed no `savingThrows` at the top level.
  3. Against `c823b3c` with EA at `+0x38` and the save text read from `proficiencies`: failed. 62
     fields `ok`, EA among them for all six; the logged save text showed the parse had the bracket
     the wrong way round. Re-judged offline with the corrected parse, all 30 save lines agreed.
  4. Against `c823b3c` with the corrected parse: passed. `verify: passed, 6 members, 120 fields, all
     equal` and `verify: offsets reading 2 in all 6 sprite dumps: 0x38`. Session log of 479 lines;
     the only `ERROR` lines are the baseline missing `dialogf.tlk` and music files, and no home path
     appears. The summary line showed in the game; the tester reported no problems in play.

### Still to check by hand

1. **The temp stats block.** Every member in every run was on `m_derivedStats` (`block=derived`); the
   walker's `m_tempStats` branch has tests only against the fake game.
2. **Improved invisibility.** No member had `STATE_IMPROVEDINVISIBILITY`, so only the fake game tests
   the 4-point save bonus the walker applies.
3. **An empty weapon slot** (THAC0 shown as 0): not met in the runs.

The next branch's spawn harness can check all three, or a repeat of the
[party check](../manual-tests/walker.md) with a member set up for each.

## Follow-ups

- **The rest of Phase 3** (`TODO.md`): enumerate the object array, keep sprites in the visible area,
  filter by EA, and the spawn harness against `.cre` files.
- **The three unexercised branches** above.
- **Resistances and magic resistance:** the check logs them but does not compare them, since the
  engine shows them only as text.
  The spawn harness can compare them with the `.cre` files.
