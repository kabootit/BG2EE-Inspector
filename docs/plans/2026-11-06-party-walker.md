# Plan: Phase 3, the party walker and the party check (`initial/07-walker`)

> **Status:** approved 2026-11-06. Edited in place until pushed, per
> [working-together.md](../rules/working-together.md). The project's own terms (gate, walker, site,
> anchor and others) are defined in [docs/README.md](../README.md).

## Context

Phase 2 put four read-only functions into the game's Lua (`A7X_native.Version/Root/Read/ReadBlock`).
Phase 3 is the first Lua that uses them: a walker that follows engine structures from `Root` to each
party member's sprite and reads its stats. The foundation plan allows enemy stats to be shown only
after one check passes (the project calls such a pass/fail check a gate): for every party member, the
walker's values must equal what the engine itself shows, through `characters[id]`, the table the
record screen is drawn from. Enemies have no such engine-provided values to compare with, so the party
is where the walker is proven.

**Decisions made (2026-11-06):**
- **The party check first.** This branch: the party walker, the comparison against `characters[]`,
  `deno task verify`, and an in-game manual test. Creature enumeration with area and EA filters, and the
  spawn harness against `.cre` files, follow on their own branch once the party values are proven.
- **`deno task test:lua` now**, not in Phase 4: the walker is tested offline against a fake memory map
  before each in-game run.

## Deliverables

- **Plans:** this plan as `docs/plans/2026-11-06-party-walker.md`; the Phase 2 plan, retroactively, as
  `docs/plans/2026-11-06-bridge.md`, both linked from `docs/README.md`.
- **ADR:** no new decision; ADR-0002 folds in `Objects()` and the 8-character file names.
- **Delivery note:** `docs/notes/<date>-party-walker.md` after the manual test.
- **Terms:** a short Terms section in `docs/README.md` defining the project's own words that pages use
  without explanation (gate, probe, bridge, walker, site, anchor, stats block, marker branch), linked
  from where the foundation plan's roadmap first says "gate".
- **Code:** `deno task re` (the analysis tooling, saved and tested), `deno task test:lua`,
  `deno task test:native`, `deno task verify`, the object-array global and `Objects()`, the first mod
  Lua (`a7xoff`, `a7xwalk`), the in-game check script and their tests.

**Decision added (2026-11-06):** the analysis code written in the scratchpad during Phases 2 and 3 is
saved as tested project tooling rather than left behind: the Deno parts as `deno task re`, the shell
comparison rewritten in Deno (no shell scripts), the C harness as `test/native/`.

### Analysis done in plan mode (read-only, scratchpad)

The key source is the engine function that fills `characters[id]` (`0x2e24c8`, about 32 KB, called by
`Infinity_UpdateLuaStats` at `0x3391e0` with the selected party member's sprite). It reads exactly the
fields an inspector needs, so its loads give the arm64 offsets directly. Offsets are sprite-relative
unless stated; image-relative for globals.

| What | Where | Evidence |
| --- | --- | --- |
| `CInfGame*` | `g_pBaldurChitin + 0x10c0` | `Infinity_UpdateLuaStats` and the stats function both load it |
| Party ids, count | game `+0x6618` (6 x `int32`), game `+0x6630` (`int16`) | `Infinity_UpdateLuaStats` indexes the ids by slot after checking the count |
| Object array | static, image `0x35d8360`: 16-byte slots, `u16` generation at `+0`, pointer at `+8`; capacity `i16` at `0x35d8350`, highest index `0x35d8352`, next generation `0x35d8354` (starts at 2000); empty slot: generation `0xffff` | lookup `0x1ae26c` (`id >> 16` is the index, the low 16 bits the generation); the clear and add functions |
| Object type | `u8` at `+0x8`; sprite is `0x31` | ten engine sites compare it with `0x31` |
| Object id | `int32` at `+0x48` | `Infinity_UpdateLuaStats` sets global `id` from it; `characters` is keyed by it |
| EA | `u8` at `+0x30` or `+0x78`: two `CAIObjectType`s (at `+0x28` and `+0x70`, EA at their `+0x8`) | the type-matching code at `0x3f2xx` compares both; which one is live is settled in the game (party must read 2) |
| Stats block | `m_derivedStats` `+0x1120`, `m_tempStats` `+0x1dc0` (size `0xca0`); `m_bAllowEffectListCall` `int32` at `+0x4e8c` selects derived when non-zero | the THAC0 code chooses between them on that flag, exactly EEex's rule |
| Every stat by `STATS.IDS` number | `CDerivedStats::GetAtOffset` at `0x7cd50`: jump table at image `0x683080`, ids 1 to 202 | decoded: ids 1 to 33 are `int16` at `2 * (id + 1)` (`MAXHITPOINTS` `+0x4`, `ARMORCLASS` `+0x6`, AC mods `+0x8` to `+0xe`, `THAC0` `+0x10`, saves `+0x14` to `+0x1c`, resistances `+0x1e` to `+0x32`); the rest recorded with their load width |
| Current HP | `int16` at `+0x57c`: the creature's base header (`.cre` layout from file offset 0 at `+0x558`; name strref `+0x560` = file `0x08`, HP = file `0x24`, base saves `+0x5ac` = file `0x54`) | `characters[id].HP.current` |
| THAC0 as shown | `derived[+0x10] - int32[+0x1204] - selected[stat 151]`; `0` when the selected weapon slot (`u8` `+0x10f8`, item pointers at `+0xfc0`) is empty | `characters[id].THAC0.current` |
| Name | strref `int32` `+0x560`, fetched with `Infinity_FetchString`; when `-1`, the engine string at `+0x3910` (`char*`) | name branch and `0x2b0434` |
| Saves in `characters[]` | text only: `savingThrows`, five `"%d (%d)"` pairs (derived and base), death to spell | format and keys at `0x2e694c` onward |

Also: Lua resource names are 8 characters at most, so the foundation plan's file names
(`a7x_offsets_273_arm64.lua`) cannot be loaded by `Infinity_DoFile`; files are named `a7xoff`,
`a7xwalk` and so on.

## Design

### Native (small)

- `builds.h`: one more global, `object_array` (`0x35d8360`), anchored by the lookup function
  (`0x1ae26c`, `0x74` bytes, whose `adrp` loads encode `0x350` to `0x360`).
- `A7X_native.Objects()` returns the array's address; `Version()` reports 2. No new engine calls.
- `native/a7x.c`, ADR-0002's function list, `re-notes.md` updated.

### Lua (`mod/inspector/lib/`, first files of the mod)

- `a7xoff.lua`: the 2.7.3 arm64 offsets, by name, and nothing else. A table `A7XOFF` with `game`,
  `party`, `objects`, `object`, `sprite`, `cre` (base header) and `stats` (id to offset and width,
  ids 1 to 24 and 151 to start, named from IESDP's `STATS.IDS`).
- `a7xwalk.lua`: `A7XWALK.party()` and `A7XWALK.creature(sprite)`. Reads go through one helper
  `R(base, "group.field")` that looks up offset and kind in `A7XOFF` and calls `A7X_native.Read`.
  Every pointer is range-checked (non-null, not `-1`, below 2^47), the object-array scan is capped by
  the array's capacity, and a type check (`0x31`) comes before any sprite read. A creature record:
  `id`, `name`, `ea` (both candidates until the game settles it), `stats_block` (`derived` or `temp`),
  `hp` (`cur`, `max`), `ac` and the four mods, `thac0` (stat 7) and `thac0_shown` (the engine formula),
  `saves` (5), `resist` (fire to missile, magic fire and cold), `mr`.
- Loaded by the check script with `Infinity_DoFile`; the WeiDU component that installs them for good
  is Phase 4.

### The party check

The pass/fail check this phase ends with: every compared value the walker reads for a party member
equals the value the engine shows for that member. Until it passes, nothing builds on the walker.

- `test/lua/a7xchk.lua` (the in-game half, like `a7xt.lua`): loads `a7xoff` and `a7xwalk`, then for
  each party member writes `A7XCHECK <id> <field> walker=<v> engine=<v> <ok|DIFF>` for `name`,
  `hp.cur`, `hp.max`, `ac` and its four mods, `thac0_shown`, and the five saves (parsed pairs from
  `savingThrows`), plus `A7XCHECK <id> skip not-populated` when `characters[id]` is missing.
  Resistances, MR, both EA candidates and the stats-block flag are logged as `A7XWALK` lines, not
  compared (the engine shows them only as text).
- `characters[id]` is filled only for a party member whose record screen has been opened, so the
  manual test opens each one.
- `deno task verify <session-log>` (`src/verify/checks.ts`, `src/tasks/verify.ts`): parses the
  `A7XCHECK` lines, prints a per-member, per-field table, and exits non-zero on any `DIFF`, any skipped
  member, or no lines at all. `--allow-read=logs` only.

### Reverse-engineering tooling (`deno task re`)

What the scratchpad did by hand, as tested modules in `src/re/` behind one task
(`src/tasks/re.ts`; `--allow-read=.,<game folder> --allow-write=build --allow-run=/usr/bin/xcrun`).
The arm64 slice is extracted with `archSlice` into gitignored `build/re/`, so no `lipo`.

| Subcommand | Does | Replaces |
| --- | --- | --- |
| `re starts` | function starts, decoded from `LC_FUNCTION_STARTS` in `macho.ts` (ULEB128 deltas) | `dyld_info -function_starts` |
| `re xrefs <string>` | every `ADRP`+`ADD`/`LDR` pair that resolves to the string, decoded from `__text` bytes in `src/re/arm64.ts` (unsigned with `>>> 0`, a pair broken by the register's redefinition) | grep over a 1.6M-line disassembly |
| `re annotate <start> [end]` | `llvm-objdump` of the range (to the next function start by default), each `ADRP`+`ADD` resolved to its C string, each `BL` to a known engine function named from `builds.h` | `annot.ts` |
| `re stats <getter>` | decodes the `GetAtOffset` jump table from the getter's own code (bound from its `cmp`, table from its `adrp`/`add`, case base from its `adr`): id, offset, width, signedness | `jt.ts` |
| `re compare <symbol> <start> [end]` | the game range against the same symbol in stock `lapi.c` built with `-O2`, normalized; instruction counts and differing lines | `cmp.sh` |
| `re hash <start> [size]` | FNV-1a 64 of a site (size defaults to the function's length), printed as a `builds.h` line | `fnv.c` |

Tests: pure functions on synthetic encodings and Mach-O fixtures (`macho_fixture.ts` gains
`LC_FUNCTION_STARTS` and sections), plus real-data cases when the game is installed: `xrefs` finds
`Infinity_Log`'s registration at `0x3356f8`; `stats` gives id 1 at `+0x4` and id 151 at `+0x1f4`;
`starts` contains every `builds.h` site; `compare _lua_setfield` differs only on relocated loads.
`docs/re-notes.md`'s recipe then cites `deno task re` instead of raw commands.

### Native and Lua tests that compile (`deno task test:native`, `deno task test:lua`)

- `test:native` (`src/tasks/test_native.ts`): compiles `test/native/*_test.c` with the library's own
  flags into `build/test/` and runs each. `bridge_test.c` is the scratch harness (it includes
  `native/a7x.c`, fakes the Lua API, checks every read kind and registration state, and checks the
  sites against the slice when the game is present). `lua_layout_test.c` compiles against the vendored
  `lstate.h` and asserts the `lua_State` offsets `builds.h` assumes.
- `lint:security`'s `--allow-run` rule also accepts repo-relative `./build/…` paths: a path starting
  with `./` is never resolved through `PATH`, which is what the absolute-path rule guards against.

### Offline Lua tests

- `deno task test:lua` (`src/tasks/test_lua.ts`, `src/build/lua.ts`): compiles `vendor/lua-5.2.4/src`
  with `xcrun clang` into gitignored `build/lua` (the scratchpad build showed `-DLUA_USE_POSIX
  -DLUA_USE_DLOPEN`, without readline, links), then runs each `test/lua/*_test.lua`; a missing
  `vendor/lua-5.2.4` fails with "run deno task setup-dev". Added to `deno task lint`.
- `test/lua/a7xwalk_test.lua`: a fake `A7X_native` over a Lua table of bytes: a game with a party of
  two, one empty slot, a derived and a temp block, a custom name and a strref name, and hostile cases
  (null and `-1` pointers, a wrong type byte, a party count of 99, a slot past the array's capacity).
- `test/lua/a7xchk_test.lua`: the comparison against a fake `characters[]`, including the
  `savingThrows` parse and a deliberate `DIFF`.
- `test/lua/a7xt_test.lua`: the bridge test script against a fake `A7X_native` (the scratchpad's
  `run.lua`, including the negative-number case it caught).

### Docs

- `docs/re-notes.md`: the table above, and the jump-table decoding as part of the recipe.
- `docs/manual-tests/walker.md` (new) + index: copy `a7xoff`, `a7xwalk`, `a7xchk` into `override/`;
  load a save; open each party member's record screen; `Infinity_DoFile("a7xchk")`; quit; remove the
  files; `deno task verify`.
- ADR-0002 fold-in (`Objects()`, the 8-character names); plan (Phase 3 split, file names); `TODO.md`
  (the enumeration branch); `docs/rules/tests.md` (the exception now covers the walker test's files);
  `CLAUDE.md` tasks and layout; `docs/requirements.md` (the Lua source now also builds `test:lua`).

## Verification

- `deno task lint`, now including `test:native` and `test:lua`; `deno task build`; the builds test
  covers the new anchor.
- `deno task re` reproduces this plan's analysis table from the installed binary (the real-data tests
  above), so the evidence is rerunnable rather than only written down.
- `test/native/bridge_test.c` extended for `Objects()`.
- `security-audit` before the game run (a new native function; Lua files copied into the game).
- **Manual test `walker.md`, run by the tester (about 10 minutes):** pass when `deno task verify` on the
  session log reports every party member populated and every compared field `ok`, one EA candidate
  reads 2 for the whole party (that one becomes the walker's EA), and the game played normally.

## Order of work

1. `git switch -c initial/07-walker` from `main`.
2. Commits, each passing `deno task lint`, messages shown first:
   1. The Phase 2 plan, saved retroactively as `docs/plans/2026-11-06-bridge.md`: the plan as approved,
      a status line saying it was delivered and where it changed in delivery (whole-function hashes
      instead of a 32-byte prefix, the console script, the `play` output commit), linked from
      `docs/README.md` and from the Phase 2 delivery note's lede;
   2. this plan as `docs/plans/2026-11-06-party-walker.md`, status "approved", linked from
      `docs/README.md`;
   3. the Terms section in `docs/README.md`, and the link to it from the foundation plan's roadmap;
   4. `deno task re` with its modules, tests and the `re-notes.md` recipe;
   5. `deno task test:native` (the C harness, the `lua_State` layout check) and `deno task test:lua`
      (the Lua build, `a7xt_test.lua`), the `./build/` run-path rule, both added to `deno task lint`;
   6. `builds.h` object array + `Objects()` + harness and builds-test coverage + ADR-0002, re-notes;
   7. `mod/inspector/lib/a7xoff.lua`, `a7xwalk.lua` + `test/lua/a7xwalk_test.lua`;
   8. `test/lua/a7xchk.lua` + its test + `deno task verify` + its test;
   9. `docs/manual-tests/walker.md` + index, foundation plan, TODO, rules, CLAUDE.md.
3. Ask before committing and pushing. Then the tester runs the manual test, and the Runs row and the
   delivery note are drafted for review.
