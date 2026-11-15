---
title: "Phase 4, the hotkey and the install: Delivery Notes"
description: "The second part of Phase 4: the creature under the pointer from CGameArea +0x244 and the party member behind a hovered portrait, as A7X.hovered, A7X.portrait and A7X.show() (API 1.1); a WeiDU component that loads the inspector from ui.menu and binds e; deno task install-mod with the pinned WeiDU; deno task re area-fields and id-fields; a return-type rule; working-visibly rules. Under the pointer passed on its first run; Hotkey and install passed on its second, after WeiDU rejected the tp2 in the first while exiting 0."
---

# Phase 4, the hotkey and the install: Delivery Notes

> Delivery record for the second part of Phase 4 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/08-output`, as planned in
> the [hotkey and install plan](../plans/2026-11-14-hotkey-install.md). The API contract is
> [docs/api.md](../api.md), its decision [ADR-0006](../adr/0006-data-model-and-api.md); the
> [working visibly](../learnings/2026-11-14-visible-work.md) learning note came out of this part.

## Status

**Manual tests passed.** A player installs the inspector with `deno task install-mod`, the game
loads it at startup, and `e` over a creature or a party portrait prints its record, running or
paused; the uninstall puts the game back. Not yet committed: the fixes from the first Hotkey and
install run, the idempotent load, the step 7 docs and this record.

| Piece | State |
| --- | --- |
| Working visibly: rules, `CLAUDE.md`, learning note | Done |
| `deno task re area-fields`, `re id-fields`; the `re` subcommands as data | Done |
| `area.picked`, `A7XWALK.picked`, API 1.1: `hovered`, `portrait`, `show()` | Done |
| [Under the pointer](../manual-tests/pointer.md) manual test | Passed on the first run |
| `mod/inspector/inspector.tp2` and its anchor test | Done; fixed after the first Hotkey and install run |
| A stated return type on every function, enforced by `deno lint` | Done |
| `deno task install-mod` | Done; checks `WeiDU.log` since the first Hotkey and install run |
| Loading `a7x` twice keeps the first API | Done |
| [Hotkey and install](../manual-tests/hotkey.md) manual test | Passed on the second run |
| The example consumer mod | The third part of Phase 4 (`TODO.md`) |

## Plan summary

The first part of Phase 4 gave other mods the `A7X` API, loaded by hand from the console. This part
makes the inspector something a player uses: installed with WeiDU, loaded by `ui.menu` at startup, and
answering one key over a creature or a party portrait. The creature under the pointer comes from an
engine field found by tallying the game's code, so the plan had it confirmed in the game, from the
console, before anything was built on it.

## What was built

### Code

The changes, by file:

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
| `test/lua/a7xwalk_test.lua`, `a7xapi_test.lua`, `fakegame.lua` | The fake areas hold `-1` under the pointer; tests for each case of `picked`, `hovered`, `portrait` and `show()`, and for loading twice |
| `mod/inspector/lib/a7x.lua` | Returns at once when `A7X` is already loaded |
| `mod/inspector/inspector.tp2` | New: copies the six Lua files, loads `a7x` after `combatLog = {}`, adds the `e` button to `WORLD_ACTIONBAR`; each anchor must occur once |
| `src/game/tp2.ts`, `test/game/tp2_test.ts` | New: the tp2's copies, patterns and replacements, checked against `mod/inspector/lib`, a stock-shaped menu and the game's own `ui.menu`; `patch()` gives the bytes WeiDU writes |
| `src/game/install_mod.ts`, `src/tasks/install_mod.ts`, `test/game/install_mod_test.ts` | New: `deno task install-mod`: the game folder and the pinned WeiDU checked first, a merge that keeps WeiDU's backup, WeiDU run in the game folder, success read from `WeiDU.log` |
| `src/lint/security.ts` | `./vendor/weidu/weidu`, the pinned WeiDU, as the one runnable path under `vendor/` |
| `src/setup/system.ts`, `src/shared/config.ts`, `src/gamefiles/iebinary.ts` | `System.run` takes a working directory; `MOD_DIR`; the `menu` resource type |
| `deno.json` and 18 files | `explicit-function-return-type` and `explicit-module-boundary-types` on, and the 32 missing return types added |

### Docs

The pages added or changed:

| Path | Change |
| --- | --- |
| `docs/plans/2026-11-14-hotkey-install.md` | New: the plan |
| `docs/rules/working-together.md`, `CLAUDE.md` | Work visibly |
| `docs/learnings/2026-11-14-visible-work.md` | New |
| `docs/re-notes.md` | The `re` commands table, checked against `src/re/commands.ts`; `+0x18` and `+0x244` cite their tallies; the portrait global |
| `docs/api.md` | API 1.1 |
| `docs/manual-tests/pointer.md` | New: Under the pointer |
| `docs/manual-tests/api.md` | Step 4: what `A7X.show()` does now, with a Changes row |
| `docs/manual-tests/hotkey.md` | New: Hotkey and install |
| `docs/manual-tests/README.md` | The check scripts need a session in which `e` has not been pressed; loading `a7x` again is harmless |
| `docs/rules/return-types.md`, `CLAUDE.md` | New rule: a stated return type on every function |
| `docs/adr/0002-read-only-bridge-lua-walker.md` | The triggers as built; `e` then a portrait click, not needed |
| `docs/architecture.md` | The `e` key in the runtime layers, the data flow, the boot sequence and the inspect workflow |
| `docs/requirements.md` | WeiDU is run by `install-mod`, only from `vendor/weidu/weidu` |
| `README.md`, `TODO.md` | Status, installation and a Use section; Phase 4 progress |

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
- **WeiDU exits 0 after a FATAL ERROR.** In the first Hotkey and install run it could not parse the
  tp2, wrote nothing, and exited 0; `install-mod` took that as success. Success is now read from
  `WeiDU.log`, which WeiDU writes only when a component installs.
- **`REPLACE_TEXTUALLY` takes no `EVALUATE_BUFFER`, and needs none:** WeiDU substitutes `%var%` in
  the replacement by itself. The tests passed with the keyword because `tp2.ts` was written to
  accept it; a simulation of a tool can only be as right as what it was told. `tp2.ts` now reads
  only the plain form, and its `patch()` gives the same bytes as WeiDU, checked by running the pinned
  WeiDU on a scratch copy of the game folder (copied `chitin.key`, `weidu.conf` and English
  `dialog.tlk`, the `data/` folder linked).
- **An uninstall leaves traces by design.** WeiDU leaves `override/` as an empty folder and adds a
  `// Recently Uninstalled: ~INSPECTOR/INSPECTOR.TP2~ #0 #0 ...` comment to `WeiDU.log`; it deletes
  `inspector/backup/`. A second uninstall does nothing and exits 0.
- **`e` reaches a button in `ui.menu`.** A button with no area and `on 'e'`, in the
  `WORLD_ACTIONBAR` menu, receives the key on the world screen, running and paused; the game does
  not take it first.
- **The preview may not draw a Mermaid diagram on first render.** The Roadmap diagram drew only
  after the preview re-rendered (opening and closing the developer tools forced it); its text was
  fine. Reload the preview before changing a diagram that does not draw.

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
- **[Hotkey and install](../manual-tests/hotkey.md), 2026-11-14, failed** (`session-20261114-235025`,
  on `0cdd610` with the step 7 docs uncommitted). In step 2 WeiDU printed
  `PARSE ERROR at line 47 column 1-35 Near Text: EVALUATE_BUFFER` and `FATAL ERROR:
  Parsing.Parse_error`, then exited 0, and `install-mod` printed `installed`; `override/` stayed
  empty and `WeiDU.log` unchanged, so `e` did nothing in step 5. Fixed: the keyword removed, the
  `WeiDU.log` check added with a test replaying this run, both checked with the real WeiDU on a
  scratch game folder, install and uninstall.
- **[Hotkey and install](../manual-tests/hotkey.md), 2026-11-15, passed** (`session-20261115-000921`,
  on `0cdd610` with the fixes and the step 7 docs uncommitted). The install wrote `ui.menu` and the
  six files and the `WeiDU.log` line; the build matched with 14 sites checked and `A7X_native`
  registered. `e` printed, in order: party members Sticker and Boom Boom; Hobgoblin Elite and Hobgoblin
  Captain (HP 40/40); the usage line; the Captain again (HP 14/40, in a fight); Hobgoblin Shaman; the
  usage line; `not a creature` twice; party members Pinner and Edwin. The tester confirmed every
  name against the tooltip or portrait it was pressed over, and the same result paused.
  `deno task verify`: data passed, 8 lines, every one a schema-1 record. No `LUA ERROR` line. After
  the uninstall `override/` was empty and `WeiDU.log` as before, plus the `Recently Uninstalled`
  comment.

### Still to check by hand

1. The BG2EE-GameLog tap and the inspector in the same `ui.menu`, installed in either order
   (`TODO.md`).

## Follow-ups

- **`deno task check-mod`:** the scratch-game WeiDU run as project tooling, so a tp2 WeiDU cannot
  parse fails before a manual test instead of in one.
- The third part of Phase 4: `examples/consumer-mod/`.
