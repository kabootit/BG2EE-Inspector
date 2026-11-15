# Plan: Phase 5, active spells, part 1: finding and proving the effect list (`initial/09-spells`)

> **Status:** approved and delivered 2026-11-15: the Effect presence test passed on its fourth run,
> recorded in the [delivery note](../notes/2026-11-15-effect-list.md). It follows the
> [hotkey and install plan](2026-11-14-hotkey-install.md), the last Phase 4 part delivered.

## Context

The `e` hotkey prints a creature's stats, but not the spells active on it. The foundation plan's
Phase 5 adds them: "Active spells and time remaining (part of the first release)". It is a large
phase, so it is split into parts, as Phase 4 was:

1. **Find and prove the effect list** (this plan): where a creature's active effects live on arm64,
   what each one holds, a walker that reads them, and the presence gate: party spell lists match the
   engine's own `characters[id].statusEffects`.
2. **Time remaining:** the current game time, each effect's expiry, the ticks-per-second constant,
   and the duration gate (a Blur countdown starts at its documented duration and reaches zero when
   the icon goes, at two game speeds).
3. **Output:** spell names generated at install time, one line per spell in `A7X.show`, an optional
   `effects` field in the record (adding an optional field keeps schema 1), enemies once 1 and 2
   pass.

The example consumer mod, the last Phase 4 part, moves to after Phase 5 (decided 2026-11-15): it
needs its own design work (how established UI mods patch `ui.menu`, whether the engine loads
`M_*.lua` files by itself), not the 30-line example the plans assumed. The research so far is kept in
`TODO.md`.

## Analysis done in plan mode (read-only)

| What | Finding | Evidence |
| --- | --- | --- |
| A first lead | the record-screen function builds `characters[id].statusEffects` from a list at sprite `+0x4cb0`, walking nodes and reading each element at node `+0x10` | `deno task re xrefs statusEffects`: one load, at `0x2e3c84`; the list load at `0x2e3cc8`, the node walk from `0x2e3cf0` |
| It may be icons, not effects | each element's first field is read as 32 bits (`ldr w1, [x27]`), where a C++ effect object would hold its vtable pointer; the Windows offsets put the timed list near `+0x4a00` and the equipped list at `+0x49b0` | the disassembly at `0x2e3cf4`; foundation plan, "Effects" row |
| Two lists | effects come in a timed list and an equipped list; only the timed list feeds countdowns | foundation plan, from the EEex thread (p19 to 21) |
| Fields wanted | per effect: opcode, duration type, expiry, source spell resref, parent spell | foundation plan, Phase 5 |

## Design

### Finding the lists (reverse engineering, as tooling)

Each finding the docs will cite comes from a `deno task re` subcommand with a test, as `area-fields`
and `id-fields` did:

- **What the `+0x4cb0` list holds:** follow its element type from the code that adds to it and the
  code that draws it (the element's 32-bit first field, its `+0x118`), and decide whether it is the
  status-icon list or the effect list.
- **The timed and equipped effect lists:** found from the code that runs effects every tick and the
  code that removes an expired one, with a tally in the shape of `id-fields` if a pattern repeats
  (the same list offset loaded at many sites from a sprite).
- **The effect's fields:** opcode, duration type, expiry, source resref and parent resref, from the
  functions that read them; cross-checked against an effect's file layout (`EFF V2.0` in IESDP),
  which the in-memory effect starts from in the other engines.

Each result goes into `docs/re-notes.md` with its evidence, and into `a7xoff.lua` only after the
in-game check below.

### The in-game check (a probe, then the gate)

- **A probe script** (`test/lua/a7xeff.lua`, a developer tool like the check scripts): for each
  party member, the list's length and, for each node, the candidate fields, logged as `A7XEFF`
  JSON lines defined in `src/model/schemas.ts`.
- **The presence gate**: `characters[id].statusEffects` lists status icons, not spells (step 2
  found the record screen builds it from a separate icon list), and an effect shows an icon through
  opcode 142 with the icon number in parameter 2. So for each party member, every icon the engine
  lists must have an opcode-142 effect with that icon in the walked lists, and the walked effects'
  source spells must include the spells cast. A manual test casts known spells (Bless, Blur, Armor,
  a potion) on party members, and `deno task verify` judges it.

### The walker

- `a7xoff.lua`: the list offsets and effect fields, once confirmed.
- `a7xwalk.lua`: `A7XWALK.effects(sprite)`, a bounded walk (a node cap, pointer checks, a stale-node
  guard), each effect as `{ opcode, duration_type, expiry, source, parent }`, or `nil` and a reason.
- The fake game gains effect lists; Lua tests for the walk, the cap, a broken list and an empty one.
- Nothing in `A7X` changes in this part: the API and `show` gain effects in part 3, once names and
  times are proven.

### Docs

`docs/re-notes.md` (the lists and fields), `docs/manual-tests/effects.md` (new, "Effect presence")
and its index row, `docs/architecture.md` (the effect walk in the runtime layers), `TODO.md` (the
consumer mod moved, with the research kept), a delivery note after the manual test.

## Verification

- `deno task lint` on every commit.
- Each offset comes from an `re` subcommand whose real-data test expects it.
- **Manual test `effects.md`**: the presence gate, run by the tester on the local tree.

## Order of work

Commits on a new marker branch `initial/09-spells` from `initial/08-output`, each passing
`deno task lint`, messages shown first:

1. This plan, linked from `docs/README.md`; `TODO.md`: the consumer mod moved after Phase 5, with
   the research into established UI mods kept.
2. The reverse-engineering subcommands and their tests, one finding at a time; `docs/re-notes.md`.
3. The probe script, its schema and its verify module, and the manual test page
   (`effects.md`); the tester's first run is the probe run, before the walker, since the walker's
   offsets come from it.
4. The walker, the fake game's effect lists and the Lua tests; the presence gate written into
   `effects.md` from the probe run, then the gate run.
5. The other docs.

Then the tester runs the manual test; I draft the record for review, and commit and push on request.
Parts 2 and 3 get their own plans.
