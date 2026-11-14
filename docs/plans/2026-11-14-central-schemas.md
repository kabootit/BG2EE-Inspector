# Plan: one central schema for every line the game writes (`initial/08-output`, continued)

> **Status:** approved and delivered 2026-11-14: the party check and creature list passed with JSON
> lines, recorded in the [delivery note](../notes/2026-11-14-data-api.md). It changes how the checks of the
> [party walker](2026-11-06-party-walker.md), [creature list](2026-11-13-creature-list.md) and
> [spawn harness](2026-11-13-spawn-harness.md) plans write their lines, and extends the
> [data API plan](2026-11-14-data-api.md)'s schema to them.

## Context

Code review on 2026-11-14 found the data shapes spread across files and defined twice. The public
record is safe: its type comes from its Zod schema, and a golden file ties the Lua producer to it.
The three check scripts are not: `A7XCHECK`, `A7XWALK`, `A7XDUMP`, `A7XLIST` and `A7XSPAWN` lines are
text, each with a hand-written type and regex parser in its own verify module, and the Lua test and
the Deno test each check against their own copy of the format. Nothing ties them together; the spawn
check's resistances, for one, depend on two files agreeing on an order neither states.

**Decisions made (2026-11-14), by the tester:**

- **JSON for every line**: each check script writes its lines as JSON through `a7xjson.lua`, the way
  `A7XDATA` already works; one Zod schema per line kind validates them, types are inferred from the
  schemas, and the regex parsers go.
- **One file**: `src/model/schemas.ts` holds every schema and every type built from them, the public
  record included: one place to read every data shape in the project.
- **A learning note** on the subject.

Accepted cost: logs from the Phase 3 runs can no longer be judged; their results stay in the delivery
notes.

## Design

### The line format

Every line the inspector writes is `<PREFIX>\t<json>`: `A7XDATA` (unchanged), and `A7XCHECK`,
`A7XLIST`, `A7XSPAWN` for the checks. Each check line is an object with `run` and a `kind`, the
discriminator. Values the walker could not read are left out by the encoder, so a schema marks such a
field optional only where "not read" is itself a result to report (the party check's engine values,
for one). The party check's `A7XWALK` and `A7XDUMP` lines become kinds of `A7XCHECK` (`walk`, `dump`),
so each check has one prefix.

| Prefix | Kinds |
| --- | --- |
| `A7XCHECK` | `party` (size), `field` (id, field, walker, engine, ok), `skip` (id, why), `walk` (id, block, state, thac0_stat, mr, resist, keys, proficiencies_keys, saving_throws), `dump` (id, hex), `error` (why) |
| `A7XLIST` | `area` (index, resref), `scan` (slots, objects, sprites, listed, ms), `creature` (id, ea, group, party, hp, state, name), `check` (name, ok, detail), `error` (why) |
| `A7XSPAWN` | `spawn` (resref, ok, why), `creature` (id, resref, block, hp, ac, thac0, saves, resist, mr, ea, each a named object, not a positional list), `header` (id, hex), `error` (why) |
| `A7XDATA` | the record, schema 1, unchanged |

Named objects replace positional lists throughout, so the order of saves and resistances is no longer
an assumption two files must share.

### `src/model/schemas.ts` (replaces `schema.ts`)

One section per prefix: the Zod schemas, `z.discriminatedUnion("kind", …)` for each check, and the
inferred types beside them; then the run aggregates the verify modules build (`CheckRun`, `ListRun`,
`SpawnRun`), as types composed from the inferred ones, so every data shape in the project is in this
file. A shared `parseLines(log, prefix, schema)` finds a prefix's lines, parses each as JSON and
validates it, returning the typed lines and a problem for each line that fails, with its log line
number. `deno task schema` keeps writing the record's JSON Schema; the check lines are internal and
get none.

### The verify modules

`checks.ts`, `list.ts` and `spawn.ts` keep only their judging: each folds its typed lines into runs
with a `switch` on `kind`, which TypeScript checks for exhaustiveness, so a kind added to a schema and
not handled is a type error. `spawn.ts`'s comparison becomes one table of fields, each with a walker
accessor and a file accessor, now that both sides are typed objects; that replaces `LISTS` and
`fileValues`'s rows, which existed because the walker side was text. `deno task verify` reports a line
that fails its schema as a problem, naming the line.

### The check scripts

`a7xchk.lua`, `a7xlist.lua` and `a7xspawn.lua` load `a7xjson` with the walker and write each line
through `A7XJSON.line(prefix, t)`, which the API uses too. What they check, and their summaries in the
message window, do not change.

Added after the first party check with JSON lines (2026-11-14): the game's log keeps at most 4084
characters of a message and cut every one-line sprite dump. `A7XJSON.line` refuses a line longer than
4000 characters with the reason, the dump is written in 512-byte lines with their offsets, and
`parseLines` reports a line whose JSON is cut short instead of skipping it.

### Drift protection, end to end

- **Type and schema**: every type is inferred from its schema; there are no hand-written copies.
- **Lua and schema**: one golden file per prefix in `test/fixtures/` (`a7xcheck.txt`, `a7xlist.txt`,
  `a7xspawn.txt`, with `a7xdata.txt` as now), generated from the fake game once and reviewed. Each
  check's Lua test requires its script to write exactly those lines; `test/model/schemas_test.ts`
  requires every golden line to pass its schema, and some broken ones to fail.
- **Schema and judging**: the exhaustive `switch` in each verify module.
- **Schema and docs**: as now for the record (`docs/data-model.md`, the JSON Schema file).

### Docs

- `docs/learnings/2026-11-14-central-schemas.md` (new): the drift found in review, the before (text
  lines, a type and a parser per file, two separate copies of each format) and the after (JSON lines,
  one schema file, inferred types, golden files on both sides, exhaustive judging), why each layer
  catches a different drift, and what it costs. Its own section, **how the code review changed
  assumptions back to the plans**, traces the chain:
  - the review questions, in order: a readable `creatureValues`, then `parseSpawns`, then
    `fileValues` (the declarative refactors), then where the types belong, which exposed the drift;
    and earlier the same day, how the record's schema is enforced, which brought in Zod;
  - each assumption that was overturned, in the plan that made it, and what replaced it: the
    foundation plan's hand-written guard (`src/model.ts`) and `test/model_test.ts`; the party walker
    plan's text `A7XCHECK <id> <field> walker=… engine=…` lines and regex parsing in `verify`, carried
    into the creature list and spawn harness plans; the Phase 4 plan's hand-written TypeScript guard,
    replaced by Zod before implementation;
  - why the assumptions survived review until then (each plan was read on its own; the duplication
    only shows across files and languages), and what to take from it: read code across the boundary
    it crosses, and treat an approved plan's mechanisms as revisable when the code shows a better one.
- ADR-0006 (not yet pushed, edited in place): every line, not only the record, is JSON defined in
  `src/model/schemas.ts`.
- `docs/manual-tests/walker.md`, `creatures.md`, `spawn.md`: `a7xjson.lua` added to the files copied
  and removed, with a Changes row each; the `block=` reference in walker.md updated.
- The plan `docs/plans/2026-11-14-data-api.md`, `docs/data-model.md`, `docs/rules/docs.md`,
  `CLAUDE.md`: `schema.ts` becomes `schemas.ts`.

## Verification

- `deno task lint` on every commit.
- **The fake game end to end**: each check script run in stock Lua, its log judged by
  `deno task verify`, as before.
- **In the game**: the three checks have passed their gates, and this changes how they write, not what
  they read. One combined session confirms the new scripts in the game: the party check and the
  creature list in one session (about 15 minutes); the spawn check, which changes the save, in its own
  only if the tester wants it. The Data API test is unchanged and still pending.

## Order of work

Commits on `initial/08-output`, each passing `deno task lint`, messages shown first. The refactor of
`spawn.ts` already made (tables of fields, line kinds and rows) is committed first, as it stands, so
the learning note about it quotes code that exists in the history; the Data API commits follow; then:

1. This plan, linked from `docs/README.md`.
2. `src/model/schemas.ts` with the check-line schemas and `parseLines`, its test, and the rename from
   `schema.ts`.
3. The check scripts writing JSON, their Lua tests, and the golden files.
4. The verify modules on the typed lines, and their tests.
5. The manual-test pages, ADR-0006, the other docs, and the learning note.
