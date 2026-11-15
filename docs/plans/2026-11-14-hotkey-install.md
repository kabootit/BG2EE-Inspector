# Plan: Phase 4, the hotkey and the install (`initial/08-output`, continued)

> **Status:** approved 2026-11-14. Edited in place until pushed, per
> [working-together.md](../rules/working-together.md). It follows the
> [data API plan](2026-11-14-data-api.md), the first part of Phase 4.

## Context

The first part of Phase 4 gave other mods the `A7X` API and gave the player console commands, loaded
by hand from `override/`. This part makes the inspector something a player uses: installed for good
with WeiDU, loaded by the game's own UI at startup, and answering one key, `e`, over a creature or a
party portrait. The foundation plan's Phase 4 calls for both; the example consumer mod is the third and
last part.

## Analysis done in plan mode (read-only)

From the arm64 slice with `deno task re`, a scratchpad disassembly, and `ui.menu` read from
`data/Patch2.bif` (there is no `ui.menu` in `override/` on this install). Each fact is confirmed by the
manual test before `docs/re-notes.md` records it.

| What | Finding | Evidence |
| --- | --- | --- |
| The creature under the pointer | the object id at `CGameArea +0x244` (`int32`) | a function at `0x904ac` takes an object and writes its id (object `+0x48`) to its area's `+0x244`; 24 engine sites compare an object's id with its own area's `+0x244` (`deno task re id-fields`), for example `0xbeba4`, in code that draws something for that object, or for every object when a display option is on, the pattern of a hover highlight; `+0x248` is a related id, compared at 11 sites, not used here |
| The portrait under the pointer | the global `mouseOverPortrait`: the portrait's slot, 0 to 5, while the pointer is over it, -1 otherwise | stock `ui.menu`: each portrait button sets it in `actionEnter` and resets it in `actionExit` |
| A key handler in `ui.menu` | a button with `on '<key>'` and no `area` | the stock character-creation screen binds `on '8'` this way |
| Where the key button goes | the `WORLD_ACTIONBAR` menu, open throughout play | its name appears once in `ui.menu`; it opens `WORLD_MESSAGES`, so output appears where the player looks |
| Where `a7x` is loaded | after `combatLog = {}`, as BG2EE-GameLog loads its tap | one instance in `ui.menu`; GameLog inserts after the same line, and both patches leave it in place, so either may install first |

Still to establish in the game: whether the world screen hands `e` to `ui.menu` at all (it may take
the key itself), whether `+0x244` holds the creature under the pointer while the player presses a key,
and whether portrait slot N is party slot N.

## Design

### Working visibly (decided 2026-11-14)

The tester could see only one-line summaries of the work: about 110 one-off Deno scripts in a
temporary folder, most of them file edits, and the analyses behind the last two findings among them.
Three practices, adopted from now on and written into the rules:

- **File changes go through the Edit tool**, so each appears in the chat as a diff. A script is used
  only for an edit too large or repetitive for it, and then named with its path when it runs.
- **Analysis whose results the docs cite becomes project tooling**, tested, as `deno task re` became
  in Phase 3. Two new subcommands, both decoding the arm64 slice's instruction bytes as the other
  `re` tools do (`src/re/fields.ts`, with `cmp` and `movz` added to `src/re/arm64.ts`), so the tests
  need no disassembler:
  - `re area-fields`: the object fields the engine compares with the area on screen (found the
    creature's area at object `+0x18`, in the creature list plan);
  - `re id-fields`: the area fields the engine compares with an object's own id (found `+0x244` for
    this plan).

  `docs/re-notes.md` cites them as the way to re-check each finding after a game update.
- **One-off scripts stay in the scratchpad**, each named with its full path and its purpose when it
  runs, so any of them can be opened.

Written into `docs/rules/working-together.md` and summarized in `CLAUDE.md`. A learning note,
`docs/learnings/2026-11-14-visible-work.md`, records the problem, what the Claude Code documentation
offers for seeing tool calls (a `verbose` setting the VS Code panel may or may not honor, the session
transcript on disk, `/export`), why the practices fix what settings cannot, and what they cost.

### Walker and API (API 1.1)

- `a7xoff.lua`: `area.picked = { 0x244, "i32" }`.
- `a7xwalk.lua`: `A7XWALK.picked()`, the sprite under the pointer in the area on screen, or `nil` and
  a reason (nothing there, or not a creature: doors and containers are objects too).
- `a7xapi.lua`, API 1.1 (adding functions is a minor version):
  - `A7X.hovered()`: the record of the creature under the pointer, or `nil` and a reason;
  - `A7X.portrait()`: the record of the party member whose portrait is under the pointer, through
    `mouseOverPortrait` and the party ids, or `nil` and a reason;
  - `A7X.show()` with no argument shows the portrait under the pointer if there is one, else the
    creature under the pointer, else prints the usage line. The hotkey calls exactly this.

### The WeiDU component (`mod/inspector/inspector.tp2`)

Adapted from BG2EE-GameLog's `gamelog.tp2`:

- `COPY` the six files of `mod/inspector/lib/` into `override/`.
- `COPY_EXISTING ~ui.menu~ ~override~`, then for each anchor `COUNT_REGEXP_INSTANCES` and
  `PATCH_FAIL` unless it occurs exactly once; then `REPLACE_TEXTUALLY`:
  - after `combatLog = {}`: `Infinity_DoFile("a7x")`;
  - after `name "WORLD_ACTIONBAR"`: `button { on 'e' action "A7X.show()" }`, the key from a tp2
    variable (`a7x_key`, `e` by default) so it is set in one place.
- `BACKUP ~inspector/backup~`, so `--uninstall` restores `ui.menu` exactly.
- The developer test component (`A7XT`) stays out of this part.

### `deno task install-mod` (`src/game/install_mod.ts`, `src/tasks/install_mod.ts`)

- Copies `mod/inspector/` into the game folder as `inspector/`, merging, never deleting, so WeiDU's
  `inspector/backup/` survives (GameLog's `copyTree()`).
- Runs the project's own WeiDU (`vendor/weidu/weidu`, from `deno task setup-weidu`), after checking its
  SHA-256 against the pinned one, as `weidu --game <game folder> inspector/inspector.tp2
  --force-install 0 --language 0 --no-exit-pause` with the game folder as working directory; no
  `setup-*` binary is copied or borrowed. `--uninstall` runs `--force-uninstall 0`.
- Permissions: read and write the game folder's `inspector/`, read the game folder, run only
  `./vendor/weidu/weidu`. WeiDU itself writes `override/` and `WeiDU.log`, as it does for any mod;
  ADR-0003 already accepts it as trusted once its hash matches.
- Built on `System` (`src/setup/system.ts`), so its tests describe a game folder and a WeiDU run
  without touching either.

### Tests

- Lua: `A7XWALK.picked` (a creature, nothing, a door, a stale id); `A7X.hovered`, `A7X.portrait` (each
  slot, -1, no portrait global), `A7X.show()` choosing portrait, then creature, then usage; the fake
  game gains `+0x244`.
- Deno: the WeiDU arguments for install and uninstall; the copy keeps an existing `backup/`; a wrong
  WeiDU hash refuses before anything runs; no WeiDU tells the user to run `setup-weidu`.
- A tp2 test: each anchor in the tp2 occurs exactly once in the game's `ui.menu` (a real-data test,
  skipped when the game is not installed), so a game update that moves an anchor fails here first.

### Docs

- `docs/manual-tests/hotkey.md` (new, "Hotkey and install") and its index row, about 20 minutes:
  1. `deno task install-mod`; `override/` now holds `ui.menu` and the six `a7x` files;
  2. `play`, load a save with creatures nearby; no console needed;
  3. hover a creature and press `e`: its two lines appear; note the name the game's tooltip shows;
  4. hover each party portrait and press `e`: that member's lines appear;
  5. press `e` over empty ground: the usage line; pause the game and repeat 3 and 4;
  6. quit, `deno task verify`, then `deno task install-mod --uninstall`: `override/ui.menu` and the
     `a7x` files are gone.

  Pass when `e` shows the right creature and the right party member, paused too, `verify` passes every
  record, and the uninstall leaves `override/` as it was.
- `docs/api.md` (API 1.1), ADR-0002 (triggers as built), `docs/architecture.md` (the install, the
  hotkey and `ui.menu` in the data flow and the runtime layers), `docs/requirements.md` (WeiDU now used
  by `install-mod`), `docs/re-notes.md` once confirmed, `TODO.md`, `CLAUDE.md`, the manual tests'
  README (the check scripts need a session in which nothing has called `A7X` yet, now that `a7x`
  loads at startup).
- Delivery note after the manual test.

## Verification

- `deno task lint` on every commit, `lint:security` covering the new task's permissions.
- `security-audit` before the install: the first time the project writes into the game folder through
  WeiDU; the backup and the uninstall are checked by the manual test.
- **Manual test `hotkey.md`**, run by the tester on the local tree.

## Order of work

Commits on `initial/08-output`, each passing `deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`.
2. Working visibly: the rules, `CLAUDE.md`, and the learning note.
3. `re area-fields` and `re id-fields`, with tests on synthetic code and a real-data test that
   finds `+0x18` and `+0x244` in the installed game; `docs/re-notes.md` cites them.
4. `area.picked`, `A7XWALK.picked`, API 1.1 (`hovered`, `portrait`, `show()`), their tests and
   `docs/api.md`.
5. `mod/inspector/inspector.tp2` and its anchor test.
6. `deno task install-mod` and its tests.
7. The manual test page and the other docs.

Then the tester runs the manual test; I draft the record for review, and commit and push on request.
