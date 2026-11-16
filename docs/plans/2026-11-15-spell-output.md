# Plan: Phase 5, active spells, part 3: spells in the output (`initial/09-spells`)

> **Status:** approved and delivered 2026-11-15: the Spell countdown test passed on its first run,
> recorded in the [delivery note](../notes/2026-11-15-spell-output.md). It follows the
> [time-remaining plan](2026-11-15-time-remaining.md), Phase 5's second part, delivered.

## Context

Parts 1 and 2 ([effect list](../notes/2026-11-15-effect-list.md),
[time remaining](../notes/2026-11-15-time-remaining.md)) proved where a creature's effects live, the
game's clock, 15 ticks a second, and removal at expiry. Nothing a player or a mod sees has changed
yet: `e` and `A7X.show` still print stats only. Part 3 shows each creature's active spells with time
left, in the console and in the record, by name, for party members and other creatures alike.

The tester chose the output: one line, all spells, soonest first.

```text
[A7X] Imoen  HP 32/32  AC 4  THAC0 17  MR 0%
      Saves D11 W13 P12 B15 S12  Resist none
      Spells FJBARDB 6s, Bless 34s, Haste 1m 42s
```

## Findings

The facts the design rests on, each from a read-only look at the installed game:

| What | Finding | Evidence |
| --- | --- | --- |
| No resref-to-name call in the game | the binary registers no `Infinity_*` function that names a spell or item from its resref | `strings` on the binary, `Infinity_*` names with spell, item, res, name or string |
| `Infinity_FetchString(strref)` exists | the stock UI calls it 149 times, with literal strrefs and variables | `Patch2.bif`, `ui.menu` |
| Table size | 1,648 spell files (1,095 with a name) and 2,867 item files (2,635 named) in the KEY: about 70 KB as a Lua table of resref to strref | a count with `openGameFiles`, `readNameStrrefs` and `openStringTable` |
| No mods installed | `WeiDU.log` lists none | the file |

## Design

### Names: a table built at install, strings fetched in the game

- **`src/gamefiles/names.ts`**: `nameStrrefs(files, strings)` maps every `.spl` and `.itm` resref
  (KEY and `override/`) to the strref the game shows as its name, chosen as `readName` does (spell:
  unidentified, then identified; item: identified, then unidentified), keeping only strrefs with
  text. A spell with no name takes its parent's (the resref minus its last character), as `verify`
  already guesses for `SPCL920A`; the guess moves here and `verify` uses it. `namesLua(map)` writes
  `A7XNAMES = { ["SPPR101"] = 9552, ... }`, keys sorted.
- **`install-mod` writes `inspector/lib/a7xnames.lua`** in the game folder after copying the
  component (its write permission already covers that folder); the tp2 copies it to `override/`
  and loads it before `a7x`: `Infinity_DoFile("a7xnames")`, then `Infinity_DoFile("a7x")`. Strrefs,
  not strings, so the game's own language shows. A mod installed later adds spells the table lacks:
  those show their resref until the next install.
- **`a7x.lua` stays as it is**, so the tests that copy the six files by hand and type
  `Infinity_DoFile("a7x")` still work, with resrefs for names.
- `a7xapi.lua` keeps `A7XNAMES` as a local and clears the global, as it does the others.

### The record and the API

- **`effects`, an optional record field** (schema stays 1, [data-model.md](../data-model.md)): the
  creature's active spells, soonest to expire first, each `{ resref, name, seconds }`.
  - One entry per source among the timed list's effects with timing mode 4096 (`O.effect.absolute`);
    `seconds` is the latest of its effects' `A7XWALK.remaining`, divided by
    `O.effect.ticks_per_second` and rounded up (Bless's 2-second visual effect must not shorten
    Bless). The field leaves out permanent and equipped effects, and absolute effects with no
    source.
  - `name`: `Infinity_FetchString` of its `A7XNAMES` strref, else the resref.
  - Missing when the walker cannot read the list or the clock (the rest of the record still
    returns); an empty array when nothing is active. Every creature, party or not.
- **`a7xfmt.lua`**: the third line, `Spells <name> <time>, ...`, or `Spells none`; no line when
  `effects` is missing. Time as `34s`, `1m 42s`, `2h 5m`.
- `src/model/schemas.ts`: the optional field; `deno task schema` regenerates
  `data-model.schema.json`; the fake game writes `test/fixtures/a7xdata.txt` again, with effects on
  one creature.
- [api.md](../api.md): `A7X.show` prints the spells line; the API version stays 1.1 (no function
  changes).

### The gate: `verify` and a manual test

- **`verify`** on every `A7XDATA` line with `effects`: each name equals what the game files give for
  its resref (with the parent guess), or the resref when they give none; each `seconds` is at most
  the spell file's longest duration for that source, plus one. That proves the table and
  `Infinity_FetchString` in the game.
- **Manual test `docs/manual-tests/countdown.md`, "Spell countdown"**, with the component installed:
  1. `deno task build`, `deno task install-mod`, `deno task play`; load a save.
  2. Cast Bless on the party; press `e` over a portrait at once: `Spells ... Bless 35s` or so.
  3. Press `e` over it every few seconds; pause the moment the icon goes and press `e`: no Bless.
     The last line before showed Bless at a few seconds.
  4. Cast a spell on a creature outside the party (an enemy or a neutral); press `e` over it: its
     name and time left.
  5. `A7X.show("party")` in the console; quit; `deno task install-mod --uninstall`, as the
     [Hotkey and install](../manual-tests/hotkey.md) test ends.
  6. `deno task verify`: every `A7XDATA` line valid, every spell's name and time plausible.

## Order of work

Commits on `initial/09-spells`, each passing `deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`; `TODO.md`.
2. The names table: `names.ts` and its tests, `install-mod` writing `a7xnames.lua`, the tp2's copy
   and load (`tp2_test.ts` allows the one generated file), `verify` using the moved guess.
3. The record's `effects`, the spells line, the schema, the golden file, `verify`'s checks, Lua
   tests with the fake game's clock and lists, `docs/api.md`, `docs/data-model.md`, and the manual
   test page; then the tester's run.
4. The record: Runs row, delivery note, `TODO.md`, the plan marked delivered.

## Verification

- `deno task lint` on every commit: the names table against a fake KEY and override, the fake game's
  records with and without effects, the formatter's times, the tp2 test.
- **Spell countdown**, run by the tester on the local tree; `deno task verify` judges the record
  lines.
