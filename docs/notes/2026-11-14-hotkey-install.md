---
title: "Phase 4, the hotkey and the install: Delivery Notes"
description: "The second part of Phase 4, in progress: the creature under the pointer from CGameArea +0x244 and the party member behind a hovered portrait, as A7X.hovered, A7X.portrait and A7X.show() (API 1.1); deno task re area-fields and id-fields for the two tallied fields; working-visibly rules. The Under the pointer test passed on its first run. The WeiDU component, the hotkey and deno task install-mod are next."
---

# Phase 4, the hotkey and the install: Delivery Notes

> Delivery record for the second part of Phase 4 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/08-output`, as planned in
> the [hotkey and install plan](../plans/2026-11-14-hotkey-install.md). The API contract is
> [docs/api.md](../api.md), its decision [ADR-0006](../adr/0006-data-model-and-api.md); the
> [working visibly](../learnings/2026-11-14-visible-work.md) learning note came out of this part.

## Status

**In progress.** The API answers for the creature and the portrait under the pointer, confirmed in the
game from the console; the WeiDU component and the hotkey that will call it are not built yet.

| Piece | State |
| --- | --- |
| Working visibly: rules, `CLAUDE.md`, learning note | Done, committed |
| `deno task re area-fields`, `re id-fields`; the `re` subcommands as data | Done, committed |
| `area.picked`, `A7XWALK.picked`, API 1.1: `hovered`, `portrait`, `show()` | Done, not committed |
| [Under the pointer](../manual-tests/pointer.md) manual test | Passed on the first run |
| `mod/inspector/inspector.tp2` and its anchor test | Next (plan step 5) |
| `deno task install-mod` | Plan step 6 |
| [Hotkey and install](../plans/2026-11-14-hotkey-install.md#docs) manual test and the other docs | Plan step 7 |

## Plan summary

The first part of Phase 4 gave other mods the `A7X` API, loaded by hand from the console. This part
makes the inspector something a player uses: installed with WeiDU, loaded by `ui.menu` at startup, and
answering one key over a creature or a party portrait. The creature under the pointer comes from an
engine field found by tallying the game's code, so the plan had it confirmed in the game, from the
console, before anything was built on it.

## What was built

### Code

The changes so far, by file:

| Path | Change |
| --- | --- |
| `src/re/arm64.ts` | Decoders for `cmp` of two registers and `movz` |
| `src/re/fields.ts` | New: `areaFields` and `idFields`, which tally the field offsets the engine compares with the area on screen and with an object's own id |
| `src/re/commands.ts` | New: the `re` subcommands as data; usage, argument checks and the re-notes table follow it |
| `src/tasks/re.ts` | `area-fields` and `id-fields`; one function per listed command instead of a `switch` |
| `mod/inspector/lib/a7xoff.lua` | `area.picked`, `CGameArea +0x244` |
| `mod/inspector/lib/a7xwalk.lua` | `picked()`: the sprite under the pointer, or why not (nothing, a stale id, not a creature) |
| `mod/inspector/lib/a7xapi.lua` | API 1.1: `hovered()`, `portrait()`, and `show()` with no argument showing the portrait, else the creature, else the usage line or the reason |
| `test/re/fields_test.ts`, `commands_test.ts` | New: synthetic code shaped like the real sites, the installed game's counts, the re-notes table against the list |
| `test/lua/a7xwalk_test.lua`, `a7xapi_test.lua`, `fakegame.lua` | The fake areas hold `-1` under the pointer; tests for each case of `picked`, `hovered`, `portrait` and `show()` |

### Docs

The pages added or changed so far:

| Path | Change |
| --- | --- |
| `docs/plans/2026-11-14-hotkey-install.md` | New: the plan |
| `docs/rules/working-together.md`, `CLAUDE.md` | Work visibly |
| `docs/learnings/2026-11-14-visible-work.md` | New |
| `docs/re-notes.md` | The `re` commands table, checked against `src/re/commands.ts`; `+0x18` and `+0x244` cite their tallies; the portrait global |
| `docs/api.md` | API 1.1 |
| `docs/manual-tests/pointer.md` | New: Under the pointer |
| `docs/manual-tests/api.md` | Step 4: what `A7X.show()` does now, with a Changes row |

## Gotchas worth remembering

- **`+0x244` holds any object's id, not only a creature's.** Over a door or container the field named
  that object: `A7X.show()` printed `not a creature`, which only the type check after the lookup can
  say. Without that check the walker would read a door as a creature.
- **Over empty ground the engine writes an id below 0, not the last one.** `A7X.show()` printed the
  usage line, the path taken only for an id below 0. The exact value was not logged.
- **The field follows the pointer while the console is open.** Each `A7X.show()` was typed with the
  pointer resting on its target and the console open, and each answered for that target; the
  console's own window did not reset the field.
- **The tallies decode bytes, not disassembly text.** The scratch scripts searched `llvm-objdump`
  output; the test task may not run it, so `fields.ts` decodes the instruction words as the rest of
  `re` does. Both gave the same counts.

## Verification

- `deno task lint` passes: format, type check, every Deno and Lua test, `lint:docs`,
  `lint:security`. The Lua tests: 8 files, the API's 16 tests and the walker's 14 among them.
- `deno task re area-fields` gives `+0x18` at 14 sites and `re id-fields` gives `+0x244` at 24 and
  `+0x248` at 11, the scratch scripts' counts; `test/re/fields_test.ts` expects them from the
  installed game.
- **[Under the pointer](../manual-tests/pointer.md), 2026-11-14, passed** (`session-20261114-221806`,
  on `1f56365` with step 4 uncommitted). The build matched with 14 sites checked and `A7X_native`
  registered. In `A7X.show()` order, the session log reads:

  | Step | Pointer on | Printed |
  | --- | --- | --- |
  | 4 | a creature, tooltip "Hobgoblin Archer" | `[A7X] Hobgoblin Archer  HP 8/8  AC 5 (missile +2, piercing +2)  THAC0 18  MR 0%`, the name in the enemy color |
  | 5 | a party member's figure | `[A7X] Boom Boom  HP 142/144  AC -2  THAC0 12  MR 10%` |
  | 6 | empty ground | `[A7X] point at a creature or a portrait, or A7X.show(id), ...` |
  | 7 | a door or container | `[A7X] not a creature` |
  | 8 | the first, last and a middle portrait | Boom Boom, Song, Sender, each its portrait's party member |

  The tester confirmed the names in steps 4, 5 and 8 by eye. `deno task verify`: data passed, 5
  lines, every one a schema-1 record. No `LUA ERROR` line.

### Still to check by hand

1. The hotkey and the install, in the Hotkey and install manual test, once steps 5 to 7 are built.

## Follow-ups

- Plan steps 5 to 7: the WeiDU component, `deno task install-mod`, the Hotkey and install manual test.
- Whether `e` reaches `ui.menu` on the world screen, which the next manual test settles.
