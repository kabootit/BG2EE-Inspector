# Plan: Phase 3, the creature list (`initial/07-walker`, continued)

> **Status:** approved and delivered 2026-11-13: the creature list manual test passed on its first
> run, recorded in the [delivery note](../notes/2026-11-13-creature-list.md). Delivered as planned,
> except that the walker.md intro correction needed no Changes row (it changed no step or pass
> criterion). It follows the
> [party walker plan](2026-11-06-party-walker.md); the project's own terms (walker, gate, stats
> block, site) are defined in [docs/README.md](../README.md#terms).

## Context

The party check passed on 2026-11-13: for every party member, the walker reads what the engine shows.
The rest of Phase 3 lists every creature around the party, not only the party, so later phases can
show enemy stats. The work splits again (decided 2026-11-13):

- **This plan: the creature list.** Scan the engine's object array, keep the creatures in the area on
  screen, and group them by EA (friendly, neutral, hostile). An in-game check proves the scan finds the
  whole party in the right area, and the tester checks by eye that it finds other creatures by name.
- **Next plan: the spawn harness.** Spawn a known creature with `C:CreateCreature` and compare the
  walker's values with its `.cre` file. This is what proves enemy values; it needs a `.cre` reader in
  Deno (adapted from BG2EE-GameLog), the console facts tested first, and a throwaway save.

Phase 3 stays on `initial/07-walker` (the foundation plan names one branch for Phase 3, walker and
harness); the branch is pushed again when this plan is delivered.

## Analysis done in plan mode (read-only)

Static, from the arm64 slice with `deno task re` and a scratchpad disassembly. Each is confirmed in the
game by the manual test before it is recorded as fact in `docs/re-notes.md`.

| What | Where | Evidence |
| --- | --- | --- |
| Areas | `CInfGame +0x6598`: 12 `CGameArea*`, 8 bytes each (to `+0x65f0`) | `CLUAConsole::ExploreArea` (`0x130de4`, bound at `0x1bf50`) indexes it; a function at `0x243ec0` compares a pointer with each of the 12 in turn |
| Visible area | `u8` at `CInfGame +0x6590`: the index into the areas | `ExploreArea`: `areas[game[+0x6590]]` |
| An area's resref | 8 bytes at `CGameArea +0x204` | `ExploreArea` copies it into a string (`0x369558`) for its result |
| A creature's area | `CGameArea*` at object `+0x18` | 14 engine sites compare it with the visible area, the same inlined `areas[index]` sequence (`0x86808`, `0xc3220` and others) |
| EA groups | friendly: EA 30 or less (`GOODCUTOFF`); hostile: 200 or more (`EVILCUTOFF`); neutral between | the type-matching code at `0x3f3e8` to `0x3f5c4` compares EA with `0x1e`/`0x1f` and `0xc7`/`0xc8`; names from IESDP's `EA.IDS` |

## Design

No native change: `Read`, `ReadBlock` and `Objects()` are enough.

### Offsets (`mod/inspector/lib/a7xoff.lua`)

- `game.areas = { 0x6598, "ptr" }`, `game.area_count = 12`, `game.visible_area = { 0x6590, "u8" }`.
- `object.area = { 0x18, "ptr" }`.
- `area.resref = 0x204` (8 bytes, read as a block, cut at the first NUL).
- `ea.friendly_max = 30`, `ea.hostile_min = 200`.

### Walker (`mod/inspector/lib/a7xwalk.lua`)

Additions, each returning `nil` and a reason instead of raising, like the existing functions:

- `A7XWALK.visible_area()`: `{ index, pointer, resref }`. The index must be below `area_count` and the
  pointer valid.
- `A7XWALK.creatures(area)`: every sprite whose `object.area` is `area`, as `{ id, sprite, ea }`, plus
  scan counts (`slots`, `objects`, `sprites`). The slot array is read with `ReadBlock` in 4 KB chunks
  (256 slots each), up to `min(highest + 1, capacity)`, never further; generation and pointer are decoded
  from the block (`u16` and an 8-byte little-endian pointer, accepted only below 2^47). Each live object
  costs one `Read` for its type, and each sprite one more for its area.
- `A7XWALK.ea_group(ea)`: `"friendly"`, `"neutral"` or `"hostile"` by the two cut-offs.
- `A7XWALK.creature(sprite)` is reused unchanged for each listed creature's name, HP and state.

The caller filters by group; `a7x_api.lua` in Phase 4 decides what is shown.

### The list check (`test/lua/a7xlist.lua`)

The in-game half, like `a7xchk.lua`: `Infinity_DoFile("a7xlist")` loads `a7xoff` and `a7xwalk`, then
writes, through `Infinity_Log`:

- `A7XLIST <run> area index=<i> resref=<r>`
- `A7XLIST <run> scan slots=<n> objects=<n> sprites=<n> listed=<n> ms=<t>` (`ms` from `os.clock` when
  the game's Lua has it, else `-`)
- one `A7XLIST <run> creature <id> ea=<ea> group=<g> party=<yes|no> hp=<cur>/<max> state=<hex> name=<name>`
  per listed creature (name last, as it may contain spaces)
- `A7XLIST <run> check <name> <ok|DIFF> <detail>` for each check below
- on failure, `A7XLIST <run> error <why>`

Checks made in the game, against what the engine itself provides:

| Check | Engine side |
| --- | --- |
| `party.<id>`: each party member is listed | the party ids at `CInfGame +0x6618`, the portraits' source |
| `party.<id>.group`: each is `friendly` | EA 2 (PC), proven by the party check |
| `unique`: no id listed twice | |
| `lookup`: each listed id leads back to the same sprite through `A7XWALK.lookup` | the engine's own id-to-object rule |
| `names`: every listed creature has a name | `Infinity_FetchString` or the custom name |

It ends with one line in the message window, such as `A7X creature list 1: AR0602, 23 creatures (6
party, 3 hostile, 14 other), all checks ok (details in the session log)`, or `could not run: <why>`.

### Verify (`src/verify/list.ts`, `src/tasks/verify.ts`)

- `parseLists(log)` and `listProblems(run)`, beside `checks.ts`.
- `deno task verify` judges every check found in the log: the party check's latest run, as now, and
  **every** run of the list check (the manual test needs two, in two areas). For each list run it
  prints the area, the scan counts and the creatures (id, group, party, name). It fails on any `DIFF`,
  any `error`, or a log with neither check.

### Tests

- `test/lua/fakegame.lua`: two areas with resrefs, a visible-area index, sprites in each area, a
  non-sprite object, an empty slot, and more than 256 slots so a second chunk is read.
- `test/lua/a7xwalk_test.lua`: the visible area; creatures in one area only; a bad index (12 or more), a
  null area pointer, `highest` past `capacity`, an unreadable chunk; `ea_group` at 30, 31, 199 and 200.
- `test/lua/a7xlist_test.lua`: all checks ok; a party member missing from the area is a `DIFF`; no
  game; the summary line.
- `test/verify/list_test.ts`: parsing, a passing run, a `DIFF`, an error, two runs in two areas.

### Docs

- `docs/manual-tests/creatures.md` (new, "Creature list") and its index row. About 15 minutes:
  1. copy `a7xoff.lua`, `a7xwalk.lua` and `a7xlist.lua` into `override/`;
  2. build, `play`, and load a save in an area with creatures besides the party;
  3. hover over three creatures that are not in the party and note their names, and whether any has a
     red (hostile) selection circle;
  4. run `Infinity_DoFile("a7xlist")`;
  5. walk through any door or area exit, then run it again;
  6. quit, remove the files, `deno task verify`.

  Pass when `verify` passes both runs, the two runs name different resrefs, the three noted names are
  in the first run's list, and any red-circled creature is `hostile`.
- `docs/re-notes.md`: the five rows above, once confirmed in the game.
- `docs/plans/2026-11-13-creature-list.md` (this plan) and its `docs/README.md` link; the foundation
  plan's Phase 3 split note; `TODO.md` (the list item becomes the spawn harness item); `CLAUDE.md`
  (`verify` judges both checks; `a7xlist`).
- `docs/manual-tests/walker.md`: its intro still says the test settles which of two EA candidates is
  live; corrected, with a Changes row.
- Delivery note `docs/notes/<date>-creature-list.md` after the manual test.

## Verification

- `deno task lint` on every commit (Deno, native and Lua tests, `lint:docs`, `lint:security`).
- `security-audit` before the game run: Lua only, and one more test file copied into `override/`.
- **Manual test `creatures.md`**, run by the tester on the local tree. It confirms the five analysis
  rows: the resref looks like an area code and changes with the area, the party is found in the
  visible area through `+0x18`, and named creatures appear with the right group.

## Order of work

On `initial/07-walker`. Commits, each passing `deno task lint`, messages shown first:

1. This plan as `docs/plans/2026-11-13-creature-list.md`, linked from `docs/README.md`; the walker.md
   intro correction.
2. `a7xoff.lua` and `a7xwalk.lua`: areas, visible area, `creatures`, `ea_group`, with the fake game and
   the walker tests.
3. `test/lua/a7xlist.lua`, its test, `src/verify/list.ts` and the `verify` task, with their tests.
4. `docs/manual-tests/creatures.md` and its index row, `TODO.md`, the foundation plan, `CLAUDE.md`.

Then the tester runs the manual test; I draft the Runs row, the `re-notes.md` rows and the delivery
note for review, and commit and push on request.
