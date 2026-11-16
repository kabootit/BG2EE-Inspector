# Plan: the first release, v0.1.0 (`release/v0.1.0`)

> **Status:** approved 2026-11-15; delivered and released as v0.1.0 on 2026-11-16
> ([delivery note](../notes/2026-11-16-first-release.md)). Edited in place until pushed, per
> [working-together.md](../rules/working-together.md). It follows Phase 5's last part, the
> [spell-output plan](2026-11-15-spell-output.md), delivered.

## Context

Phases 0 to 5 of the [foundation plan](2026-11-01-inspector-foundation.md) have shipped: stats and
active spells on `e`, the console and the API, checked in the game. v0.1.0 releases that as it works
today: a player downloads the source at the `v0.1.0` tag and installs and runs it with Deno, the same
`deno task` flow the manual tests use. The release says so plainly, in the release notes, the
installation guide and the README, and says that a WeiDU-compatible install, with no Deno, comes
in a later release.

Why not the WeiDU way now: macOS loads the inspector's native library only when the game starts with
`DYLD_INSERT_LIBRARIES` ([ADR-0001](../adr/0001-native-dylib-injection.md)); the game's Lua cannot
load a library itself ([ADR-0005](../adr/0005-dyld-interposing-hook.md)); every static option
changes files inside the game's `.app`. Those options, and what the research found about how mods
ship, go to `TODO.md` for the next release.

## Design

### The name

`A7X` meant nothing and typed awkwardly, and renaming the public API after a release would break the
mods that use it, so v0.1.0 renames it first:

| Was | Is | Why |
| --- | --- | --- |
| the Lua table `A7X` | `I` (for Inspector), API 2.0 | what players and mods type: `I.show("party")`, `I.get(id)`; the game's own Lua never uses `I` |
| `A7X_native`, `[A7X]`, the library's lines (`A7X build …`), `A7XDATA` and the other log prefixes, `build/a7x.dylib` | `Inspector_native`, `[Inspector]`, `Inspector build …`, `INSPECTOR_DATA` and the rest, `build/inspector.dylib` | the project's own name, easy to search for in a log |
| the game's Lua files, `a7x.lua`, `a7xwalk.lua` and the rest | `insp.lua`, `inspwalk.lua` and the rest | `Infinity_DoFile` loads names of 8 characters at most ([ADR-0002](../adr/0002-read-only-bridge-lua-walker.md)); a test now checks every one |

A one-off script made the change in every living file; the records of past work (delivery notes,
plans, learnings, ADRs and every manual test's Runs) keep the old names, and each manual test whose
steps changed gained a Changes row.

### What a player downloads

The `v0.1.0` tag's source archive, which GitHub attaches to every release (or `git clone --branch
v0.1.0`). Nothing prebuilt: `deno task build` compiles the library on the player's Mac, as now.

### The version

- `mod/inspector/inspector.tp2` gains `VERSION ~v0.1.0~`, which WeiDU writes into `WeiDU.log`.
- **`CHANGELOG.md`** (new, at the root): `## 0.1.0 (2026-11-16)`, the release notes. A test checks
  that the tp2's `VERSION` and the newest changelog heading agree.

### Release notes (`CHANGELOG.md`, and the GitHub release body)

- **What it does:** `e` over a creature or portrait prints its stats and active spells with time
  left; `A7X.show` in the console; the `A7X` API and `A7XDATA` lines for other mods and tools.
- **Requires Deno, for now:** installing and every launch go through `deno task install-mod` and
  `deno task play`; launching the game any other way runs it without the inspector. A
  WeiDU-compatible install that needs no Deno comes in a later release (`TODO.md`).
- **Supports:** BG2:EE 2.7.3, the Steam build, on Apple Silicon. Any other build: the library
  disables itself and prints `A7X disabled: unknown build <uuid>`; the notes say how to report it.
- **Known limits:** other mods untested; the bard song shows its resref (`FJBARDB`).

### The installation guide: `docs/install.md` (new)

For players, linked from `README.md` and `docs/README.md`, every step one a tester has run:

1. **Requirements:** a Mac with Apple Silicon; BG2:EE 2.7.3 (the Steam build); Deno 2.9.8 or later;
   the Command Line Tools (to build the library); [requirements.md](../requirements.md) for the full
   list.
2. **Get the source** at `v0.1.0`.
3. `deno task setup-weidu`, `deno task doctor`, `deno task build`, `deno task install-mod`.
4. **Every time you play:** `deno task play`. A game started from Steam or Finder runs without the
   inspector; `e` then does nothing.
5. **Use:** `e`, and the console commands.
6. **Uninstall:** `deno task install-mod --uninstall`.
7. **A game in another folder:** `BG2EE_GAME_DIR` (and the other `BG2EE_*` settings in
   `src/shared/config.ts`), for a Steam library elsewhere.
8. **Trouble:** `A7X disabled` and what to send; reinstall after a mod rewrites `ui.menu`.

### README

- **Status:** v0.1.0 released, with a link to the release notes; no longer "under construction".
- **Installation:** the short form, linking `docs/install.md`, with the Deno requirement and the
  planned WeiDU install stated up front.
- The players' and contributors' requirements in `docs/requirements.md` stay as they are; the guide
  points into them.

### `TODO.md`: a WeiDU-compatible install, planned

Replaces the "Launching without Deno" item, keeping what this plan's research found:

- **How mods ship on macOS:** a `mac-<mod>-<ver>.zip` (or `osx-`) of the mod folder, extracted into
  the folder holding `chitin.key` (beside the `.app` for Steam, inside
  `<game>.app/Contents/Resources` for GOG and Beamdog); players use their own WeiDU or the Mac WeiDU
  Launcher; Project Infinity reads `<tp2>.ini` `[Metadata]`.
- **Quarantine:** players approve a downloaded file through System Settings, Privacy & Security;
  the guide never tells them to strip quarantine, and double-clicked `.command` files fail under it.
- **The names table without Deno:** a prebuilt base for the archives, topped up by the tp2 from
  `override/`.
- **Loading the library statically, three options, each needing an ADR:** a proxy
  `libsteam_api.dylib`, a patched executable, or launch-time loading set once in Steam.
- **Assume nothing about the player's install:** no store, path or layout.

### Publishing

Tagging `v0.1.0` and `gh release create v0.1.0 --notes-file` (the changelog entry) are
outward-facing: only on request, after the release test passes and after the `security-audit`
skill's pre-publishing pass (history free of home paths, emails and AI attribution).

### Manual test `docs/manual-tests/release.md`, "Release install"

A player's install from a fresh copy of the source: every file git tracks or would track, copied
into a scratch folder (so nothing ignored, `vendor/`, `build/` or `logs/`, comes along, and the run
needs no commit), then the guide's commands, all on the one page: setup-weidu, doctor, build,
install-mod, play, `e` over a party member with a spell up, quit, uninstall; `deno task verify` in
the copy judges the session. Passes when every step does what the page says and the record and its
spells pass `verify`.

## Order of work

On a new branch `release/v0.1.0`, each commit passing `deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`; the `TODO.md` item.
2. The tp2 `VERSION`, `CHANGELOG.md` and its test, `docs/install.md`, the README, the manual test
   page; then the tester's run.
3. The record: Runs row, delivery note; then, on request, the security audit, the tag and the
   GitHub release.

## Verification

- `deno task lint`: the version test, the docs (links, reachability, passive voice).
- **Release install**, run by the tester from a fresh copy of the source; `deno task verify` judges
  it.
