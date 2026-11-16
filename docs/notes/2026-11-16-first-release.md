---
title: "The first release, v0.1.0: Delivery Notes"
description: "v0.1.0 releases the inspector as it works today, installed and run through Deno, and says so in the release notes, the new installation guide and the README, with a WeiDU-compatible install planned. Before it, the public names changed from A7X to I and Inspector, API 2.0, and the game's Lua files took the insp prefix within Infinity_DoFile's 8 characters. The Release install test passed on a fresh copy of the source."
---

# The first release, v0.1.0: Delivery Notes

> Delivery record for the first release, on `release/v0.1.0`, as planned in the
> [first-release plan](../plans/2026-11-15-first-release.md). The player's guide is
> [docs/install.md](../install.md), the release notes are [CHANGELOG.md](../../CHANGELOG.md), and the
> manual test is [Release install](../manual-tests/release.md).

## Status

**Released as v0.1.0 on 2026-11-16.** A fresh copy of the source installed, played and uninstalled
with the guide's commands; the security audit found nothing; the `v0.1.0` tag marks the commit that
holds this record, and the GitHub release carries the changelog entry.

| Piece | State |
| --- | --- |
| The rename: `I`, `Inspector`, the `insp` files, API 2.0 | Done |
| The tp2's `VERSION`, `CHANGELOG.md` and the test that ties them | Done |
| `docs/install.md`, the README, `docs/requirements.md` | Done |
| The WeiDU-compatible install and its research | In `TODO.md`, for the next release |
| [Release install](../manual-tests/release.md) manual test | Passed on the first run |
| Security audit, tag, GitHub release | Done |

## Plan summary

Phases 0 to 5 work in the game. v0.1.0 ships that as the manual tests run it: a player downloads the
source at the tag, and `deno task` builds the library, installs the WeiDU component and starts the
game with the library loaded. A game started from Steam or the Finder runs without the inspector,
because macOS loads the library only at launch ([ADR-0001](../adr/0001-native-dylib-injection.md)) and
the game's Lua cannot load one ([ADR-0005](../adr/0005-dyld-interposing-hook.md)). Every way round
that changes files in the game's `.app`, so it waits for the next release.

## What shipped

### Code

The rename, by kind of name, then the version:

| Path | Change |
| --- | --- |
| `mod/inspector/lib/` | `a7x*.lua` became `insp.lua`, `inspoff.lua`, `inspwalk.lua`, `inspjson.lua`, `inspfmt.lua`, `inspapi.lua`, and the names table `inspname.lua`; the public table `A7X` became `I`, API 2.0; the globals `INSPECTOR_OFF`, `INSPECTOR_NAMES` and the rest |
| `native/inspector.c`, `native/builds.h` | Was `a7x.c`; registers `Inspector_native`; prints `Inspector build …`, `Inspector registered …` and `Inspector disabled: unknown build <uuid>` |
| `mod/inspector/inspector.tp2` | `VERSION ~v0.1.0~`; copies and loads the `insp` files; the key runs `I.show()` |
| `src/` | The log prefixes `INSPECTOR_DATA`, `INSPECTOR_CHECK`, `INSPECTOR_LIST`, `INSPECTOR_SPAWN`, `INSPECTOR_EFF`, `INSPECTOR_T`; `build/inspector.dylib`; `tp2.ts` reads the tp2's `VERSION` |
| `test/lua/` | The probes `inspchk`, `insplist`, `inspspwn`, `inspeff`, `inspt`, each within 8 characters |
| `test/game/tp2_test.ts` | Two new tests: every Lua file the game loads has a name of 8 characters at most, and the tp2's `VERSION` is the newest release in `CHANGELOG.md` |
| `.claude/skills/security-audit/SKILL.md` | The new names |

### Docs

The pages added or changed:

| Path | Change |
| --- | --- |
| `CHANGELOG.md` | New: the release notes, which the GitHub release reuses |
| `docs/install.md` | New: the player's guide, from requirements to uninstall, a game in another folder, and trouble |
| `README.md` | Status v0.1.0; installation in five steps with Deno required and the WeiDU install planned |
| `docs/requirements.md` | Approving a downloaded WeiDU in Privacy & Security |
| `TODO.md` | The WeiDU-compatible install: how mods ship on macOS, quarantine, the names table without Deno, three ways to load the library statically |
| `docs/api.md`, `docs/data-model.md`, `docs/architecture.md`, `CLAUDE.md`, rules | The new names; `docs/api.md` records API 2.0 |
| `docs/adr/0002`, `docs/adr/0006` | Amended for the new file names |
| `docs/manual-tests/` | `release.md` new; a Changes row in each test whose steps name the old names |
| `docs/plans/2026-11-15-first-release.md` | New: the plan |

## Gotchas worth remembering

- **`Infinity_DoFile` loads names of 8 characters at most** (ADR-0002). The first pass of the rename
  gave the game's files names such as `inspector_walk`, which the game would never have loaded; the
  Lua tests load files with `dofile`, which has no such limit, so nothing caught it until the ADR was
  reread. A test now checks every name the game loads.
- **A word-by-word rename needs a dry run.** Turning the message prefix `A7X` into `Inspector` would
  also have turned `if A7X and` into `if Inspector and`; the dry run showed it before the script
  wrote anything.
- **A test step that copies files must stop when the copy fails.** The first try of step 1 ran
  outside the repo, `git` failed, and `ls` listed an old copy from an earlier partial run, which looked
  like success. Step 1 now stops at the `git` failure and clears any old copy, and step 11 keeps the
  session log, which the first run deleted with the copy.
- **WeiDU writes the tp2's `VERSION` into `WeiDU.log`,** on the install line and on its
  `Recently Uninstalled` line, so a player's log says which release they had.

## Verification

- `deno task lint` passes: format, lint, type check, every Deno, native and Lua test, `lint:docs`,
  `lint:security`.
- **[Release install](../manual-tests/release.md), one run, 2026-11-16,** passed as the tester
  reported. The run copied every file git tracks or would track into a scratch folder, with no
  `vendor/`, `build/` or `logs/`. In that copy, `setup-weidu`, `doctor`, `build`, `install-mod`,
  `play`, `e` over a party member with a spell and over another creature, the uninstall and `verify`
  each did what the page expects. The game's `WeiDU.log` afterwards read
  `// Recently Uninstalled: ~INSPECTOR/INSPECTOR.TP2~ #0 #0 // BG2EE-Inspector: a creature's stats on one key: v0.1.0`.
  The session log went with the copy, so this record cites no line counts from it.
- The guide against the test: `docs/install.md`'s Install, Play and Uninstall sections hold the same
  commands as steps 2 to 6 and 9, with the same expectations; nothing needed fixing. The guide's
  "Get the source" step, the release's zip or a clone at the tag, waits for the tag.

- The `security-audit` pass before publishing: no home path, email or Steam id in any of the 94
  commits or the release's changes, no AI attribution in any message; `native/` changed in names
  only, its diff with the names masked empty.

## Follow-ups

- The WeiDU-compatible install, with no Deno (`TODO.md`).
- A name for the bard song: no spell file gives `FJBARDB` one.
