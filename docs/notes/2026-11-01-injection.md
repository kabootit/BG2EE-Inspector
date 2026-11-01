---
title: "Phase 0, injection: Delivery Notes"
description: "A constructor-only arm64 dylib, deno task build and deno task play: the library loads into BG2:EE 2.7.3 through DYLD_INSERT_LIBRARIES set by env inside script's arguments, and a control run without it shows no marker."
---

# Phase 0, injection: Delivery Notes

> Delivery record for Phase 0 of the [foundation plan](../plans/2026-11-01-inspector-foundation.md).
> The gate it answers is [ADR-0001](../adr/0001-native-dylib-injection.md), now active.

## Status

**Gate passed.** The library loads into the game process, with nothing changed in the game on disk.
Committed and pushed on `main` and the marker branch `initial/03-injection`, as three focused commits that
each pass lint on their own.

| Piece | State |
| --- | --- |
| `native/a7x.c` | Done; a constructor that prints one line to stderr, nothing else |
| `deno task build` | Done; arm64, ad-hoc signed, warnings as errors |
| `deno task play` | Done; pty launch, redacted session log, load check; `--no-inject` for the control run |
| Injection gate | Passed on 2026-11-01 |
| Five minutes of play with the library loaded | Not yet; the injected run lasted about 1.5 minutes |

## Plan summary

Phase 0 answers one question before any reverse engineering starts: does a library of our own load into
the hardened-runtime 2.7.3 game? The library does nothing but announce itself. The launcher matters as
much as the library, because the variable has to survive the pseudo-terminal wrapper that keeps the
game's output line-buffered.

## What was built

### Code

The new modules, by folder (see "src layout" in [architecture.md](../architecture.md#src-layout)):

| Path | Content |
| --- | --- |
| `native/a7x.c` | `__attribute__((constructor))` printing `A7X loaded into <program> pid=<n>` to stderr |
| `src/build/dylib.ts` | Compiler arguments, `buildDylib` and `verifyDylib` (arm64 and `Signature=adhoc`); shared by `build` and `doctor` |
| `src/game/capture.ts` | `LineBuffer`, `clean` (pty artifacts), `redact` (home path, Steam id), `stamp` (log file names) |
| `src/game/launch.ts` | `launchCommand`, the argument list with or without the library, and `summarize`, which finds load markers that name the game |
| `src/game/session.ts` | Runs the launch, drains stdout and stderr into the log, forwards Ctrl+C to the game |
| `src/tasks/build.ts`, `play.ts` | Entry points |
| `test/build/`, `test/game/` | Argument lists, the load check, line splitting, artifacts, redaction |

### Permissions

Each new task gets only what it touches:

| Task | Reads | Writes | Network | Runs |
| --- | --- | --- | --- | --- |
| `build` | the repo | `build/` | none | `xcrun`, `codesign` |
| `play` | the repo, the game folder | `logs/` | none | `script`, `codesign` |

`env` runs inside `script`, so it does not appear in `play`'s `--allow-run` list; `play` refers to it by
absolute path.

## Gotchas worth remembering

- **Set the variable on the game, not on `script`.** `/usr/bin/script` is SIP-protected, so dyld strips
  `DYLD_*` variables from it and they never reach the child. The launch is
  `script -q /dev/null /usr/bin/env DYLD_INSERT_LIBRARIES=<dylib> <game>`. A stand-in program showed both
  halves before the game was touched: the library loaded through `env`, and the variable set on `script`
  produced no marker.
- **`script` needs stdin from `/dev/null`** when it does not run in a terminal of its own. It then echoes
  end-of-input at once, so its `^D` and two backspaces arrive at the start of the first line, not at exit.
  `clean()` strips them there.
- **The constructor runs before the engine logs anything.** The marker is the first line of the injected
  session, ahead of the engine's working-directory line, which matches running before `main`.
- **An unanchored `.gitignore` entry hid source folders.** `build/` matched every folder of that name,
  so `src/build/` and `test/build/` were ignored by git and, because `deno fmt` skips gitignored files,
  by the format check too. The entry is now `/build/`, and the two files were formatted.
- **Baseline engine errors.** Both runs log `Failed to load file` for `dialogf.tlk` and four music files.
  They appear without the library too, so they are the install's own noise, not an effect of injection.
- **The engine mounts zip archives from three places at startup.** The 2.7.3 executable lists
  `home:/*.zip`, `install:/*.zip` and `install:/dlc/*.zip` (plus `install:/workshop/*.mod`) among its
  resource locations, next to the format string `mounting archive: %s` and `mod.key`. `install:` is the
  game folder and `home:` the user folder in Documents, as the session logs show. This is the engine's
  DLC mechanism. This install has no mods installed (`WeiDU.log` holds only its header, and there is no
  `override/`), but a downloaded Stratagems archive sits in the game folder and both runs log
  `mounting archive` for it. That zip holds no `mod.key` and no `.bif` files, so it most likely supplies
  nothing; whether a keyless zip can supply loose files is untested. Noted in `TODO.md`.

## Verification

Commands run on 2026-11-01:

- `deno task lint`: fmt, lint, type-check, 62 tests (62 passed), `lint:docs` and `lint:security` with no
  findings.
- `deno task build`: `build/a7x.dylib`, reported `arm64, Signature=adhoc`.
- **Stand-in program**, before the game: the library loaded through `script` and `env`; no marker without
  the variable, and none with the variable set on `script` itself.
- **The game**, run by hand from a terminal:
  - `deno task play --no-inject`: the game ran to the main menu and exited with code 0; 82 lines captured,
    0 load markers.
  - `deno task play`: `A7X loaded into BaldursGateIIEnhancedEdition pid=…`, then a clean exit with code
    0; 222 lines captured. The log goes past the main menu: game globals are set and the resource folders
    are rescanned eight more times than in the control run, consistent with a save being loaded.
  - Both session logs: no home path and no Steam id; the engine's Steam id line reads `<steam-id>`.

Still to check by hand:

1. Play five minutes or more with the library loaded, through an area change, and confirm the game
   behaves as without it.

## Follow-ups

- Phase 1: reverse engineering of the arm64 slice, and the address table in `native/builds.h`
  (`initial/04-reverse-engineering`).
- The library's line goes to stderr, which the pty merges with the game's stdout. Phase 2's
  `A7X disabled: <reason>` uses the same path.
