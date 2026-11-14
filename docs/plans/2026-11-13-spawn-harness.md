# Plan: Phase 3, the spawn harness (`initial/07-walker`, continued)

> **Status:** approved 2026-11-13. Edited in place until pushed, per
> [working-together.md](../rules/working-together.md). It follows the
> [creature list plan](2026-11-13-creature-list.md); the project's own terms (walker, gate, stats
> block) are defined in [docs/README.md](../README.md#terms).

## Context

The walker reads the party exactly as the engine shows it, and lists every creature in the area on
screen. Nothing yet proves its values for a creature that is not in the party: the engine shows no
stats for enemies, which is why the inspector exists. The spawn harness is the last piece of Phase 3
and the gate before any enemy value is shown: spawn creatures whose `.cre` files are known, read them
with the walker, and compare with the files.

The engine's own console object does the spawning (`C:CreateCreature`, used by the stock cheat menu),
so the native library stays read-only. Spawning changes the game, so the manual test uses a save that
is never saved afterwards.

## Analysis done in plan mode (read-only)

From the arm64 slice with `deno task re`, and a scan of the game's `.cre` files in the scratchpad
with BG2EE-GameLog's readers. Each fact is confirmed by the manual test before `docs/re-notes.md`
records it.

| What | Finding | Evidence |
| --- | --- | --- |
| `C:CreateCreature(resref)` | one string argument; `CLUAConsole::CreateCreature` at `0x1304e4` checks the resource exists as a `.cre` (type `0x3f1`), takes a position from the area on screen (probably the pointer), allocates a `0x5370`-byte `CGameSprite` and constructs it (`0x29e758`) | the Lua binding at `0x1bc64` (bound at `0x182cc`) |
| A sprite's `.cre` resref | 8 bytes at sprite `+0x540`, just before the `.cre` header copy at `+0x558` | `0x2d7e88`, called with the resref right after construction, stores it there |
| Fixtures | 466 of the game's 4,735 `.cre` files have no items and no effects, so their stats should not be changed by equipment; 383 of those are neutral (EA 128) | the scan |

Four fixtures, neutral, natural AC equal to effective AC, none in `override/`, chosen for varied
values. `MUMFIG01`, with negative resistances, was the second until the first run: it matched in
every field, then died or vanished within seconds. `DRBOD` replaced it, a creature with no scripts at
all; no script-free candidate has a negative resistance.

| Resref | Why |
| --- | --- |
| `COWH` | a cow: no class, AC 5, one resistance |
| `DRBOD` | no scripts; three immunities, magic resistance 75, DEX 24 |
| `DADROW8` | high magic resistance (66), a drow |
| `SHFIRE` | fire immunity, varied saves |

## Design

### Game files in Deno (`src/gamefiles/`)

Adapted from BG2EE-GameLog (same author), with an attribution line in each file; only what this needs:

- `iebinary.ts`: `readKey`, `readBiffHeader`, `readBiffEntries`, and `readCre` extended with the AC
  modifiers (`0x4a` to `0x50`), the EA (`0x270`), and the item and effect counts (`0x2c0`, `0x2c8`).
  Offsets from IESDP.
- `resources.ts`: `override/` first, then the BIFs through `chitin.key`, with plain path joins (no
  `jsr:@std/path`).

### Walker

- `a7xoff.lua`: `sprite.resref = 0x540` (8 bytes); `A7XWALK.creature` gains `resref`, read as a block
  and cut at the first NUL, like the area's.

### The spawn check (`test/lua/a7xspawn.lua`)

`Infinity_DoFile("a7xspawn")`, typed in the console with the game paused:

1. On its first run in a session, it calls `C:CreateCreature(resref)` for each fixture, inside
   `pcall`, and logs `A7XSPAWN <run> spawn <resref> ok|failed <why>`. No `C` is an error, which itself
   settles a fact.
2. Every run then lists the creatures in the area on screen (`A7XWALK.creatures`) and, for each whose
   `resref` is a fixture, logs `A7XSPAWN <run> creature <id> resref=<r> block=<b> hp=<cur>/<max>
   ac=<ac>,<crushing>,<missile>,<piercing>,<slashing> thac0=<t> saves=<5> resist=<10> mr=<m> ea=<ea>`
   and `A7XSPAWN <run> header <id> <hex>`, the first `0x2d4` bytes of the `.cre` header copy at `+0x558`.
3. A summary in the message window: `A7X spawn check 1: spawned 4, found 4 of 4 (details in the session
   log)`, or what is missing, or `could not run: <why>`.

The manual test runs it twice: once right after spawning, and again after letting the game run for a
few seconds. That shows whether a creature is readable straight away and whether the stats block in
use changes after its first update (the walker's temp-block branch, so far tested only offline). The
first reading is the one judged, because a `.cre` describes a creature as it is spawned; changed on
2026-11-13 after the second run, in which the tester attacked the creatures between the readings.

### Verify (`src/verify/spawn.ts`, `src/tasks/verify.ts`)

- `parseSpawns(log)` and `compareCreature(creature, cre, dexAc)`: for the run that spawned, every
  fixture found, and for each creature found, the walker's values against its `.cre`: max HP, AC (effective)
  and the four modifiers, THAC0, five saves, the ten resistances and magic resistance, EA. Current HP
  is printed, not judged.
- The header bytes are compared with the file's first `0x2d4` bytes and the differing offsets printed:
  evidence for the header mapping and for later fields, not a pass condition.
- `deno task verify` judges this check too when its lines are in the log. It now reads `.cre` files,
  so its permissions widen to `--allow-read=logs,<game folder>` and the `BG2EE_*` environment names,
  scoped like `doctor`'s.

A `DIFF` is a finding, as with the party check: the delivery note records it, and the rule behind it
(an engine adjustment, or a walker mistake) is settled before it is fixed. The first run found one:
the engine's AC is the file's plus the Dexterity adjustment in `DEXMOD.2DA`'s AC column (a drow with
DEX 18 read 6 against 10, and the table gives -4 for 18), so `verify` reads DEX from the `.cre` and
the table from the game, and expects the sum.

### Tests

- `test/gamefiles/iebinary_test.ts`: synthetic KEY, BIFF and CRE bytes; a real-data case when the game
  is installed: `chitin.key` parses, and each fixture resolves as `CRE V1.0` with no items and no
  effects (no game values are written into the repo).
- `test/lua/fakegame.lua`: a resref on each sprite; `test/lua/a7xspawn_test.lua` with a fake `C`: the
  spawn calls, fixtures found and not found, no `C`, the summary.
- `test/lua/a7xwalk_test.lua`: the resref.
- `test/verify/spawn_test.ts`: parsing, an equal creature, a `DIFF`, a fixture not found, header offsets.

### Docs

- `docs/manual-tests/spawn.md` (new, "Spawn check") and its index row, about 15 minutes:
  1. copy `a7xoff.lua`, `a7xwalk.lua` and `a7xspawn.lua` into `override/`;
  2. build, `play`, load a save in a quiet place, and note the difficulty setting;
  3. pause, move the pointer to open ground near the party, open the console and run
     `Infinity_DoFile("a7xspawn")`; note where the creatures appear;
  4. unpause for about three seconds, pause, run it again;
  5. quit **without saving**, remove the files, `deno task verify`.

  Pass when `verify` finds all four fixtures in the run that spawned and every judged field is equal.
- `docs/re-notes.md` once confirmed: `C:CreateCreature`, the sprite resref, which `.cre` fields the
  derived stats equal.
- Plan `docs/plans/2026-11-13-spawn-harness.md` and its link; `docs/rules/tests.md` (`a7xspawn.lua`);
  `TODO.md` (Phase 3 done when it passes; Phase 4 next); foundation plan note; `CLAUDE.md` (`verify`,
  `src/gamefiles/`); `docs/requirements.md` if `verify` reading the game folder needs a line.
- Delivery note after the manual test.

## Verification

- `deno task lint` on every commit.
- `security-audit` before the game run: `verify` gains read access to the game folder (read-only,
  scoped); the check calls the engine's console, which changes game state, so the test page says to
  use a save that is not saved again; no change to `native/`.
- **Manual test `spawn.md`**, run by the tester on the local tree.

## Order of work

On `initial/07-walker`. Commits, each passing `deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`.
2. `src/gamefiles/` with its tests.
3. The sprite resref in `a7xoff.lua` and the walker, with the fake game and the walker test.
4. `test/lua/a7xspawn.lua` and its test, `src/verify/spawn.ts`, the `verify` task and permissions, with
   their tests.
5. `docs/manual-tests/spawn.md` and its index row, rules, `TODO.md`, foundation plan, `CLAUDE.md`.

Then the tester runs the manual test; I draft the Runs row, the `re-notes.md` rows and the delivery
note for review, and commit and push on request.
