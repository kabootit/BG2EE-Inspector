---
type: ADR
id: "0006"
title: "One versioned record: Lua tables in the game, JSON lines outside, a Zod schema as the definition"
description: "The inspector's data is a schema-1 record: plain Lua tables from the public A7X API inside the game, JSON lines (A7XDATA) for tools outside it, both checked against one Zod schema. A7X is the only global the inspector leaves; the API takes the native read table private."
status: active
date: 2026-11-14
---

# ADR-0006: One versioned record: Lua tables in the game, JSON lines outside, a Zod schema as the definition

**Status:** Active · **Date:** 2026-11-14

**Amended 2026-11-15, before v0.1.0:** the names changed, the decision did not. The public table
`A7X` is `I`, API 2.0; `A7X_native` is `Inspector_native`; the lines `A7XDATA`, `A7XCHECK`,
`A7XLIST` and `A7XSPAWN` are `INSPECTOR_DATA`, `INSPECTOR_CHECK`, `INSPECTOR_LIST` and
`INSPECTOR_SPAWN`. The text below keeps the names as decided
([first-release plan](../plans/2026-11-15-first-release.md#the-name)).

## References

- [ADR-0002](0002-read-only-bridge-lua-walker.md): the read-only bridge and the walker this API
  builds on, and its "data-first output" decision, made concrete here.
- [ADR-0003](0003-toolchain.md): the toolchain, which gains Zod as its one library.
- [Phase 4 plan](../plans/2026-11-14-data-api.md): the data API and console output, where the
  project made this decision.
- [docs/api.md](../api.md) and [docs/data-model.md](../data-model.md): the contract and the record,
  as consumers read them.

## Context

Phase 3 proved what the walker reads. Two kinds of consumer need it:

- **Other game mods**, a UI panel for one, which run in the game's own Lua 5.2. Inside the game there
  is no TypeScript, no package manager and no network; files load only through `Infinity_DoFile`,
  with names of 8 characters at most.
- **Tools outside the game**: the project's own `deno task verify`, BG2EE-GameLog, a future viewer.
  They see only what the game writes to its log, which `deno task play` captures.

The walker's tables are internal: their fields follow the engine (stats blocks, offsets) and change
with it. A consumer needs a record whose fields have a fixed meaning and a version, and must not be
able to make raw memory reads, which can crash the game and depend on per-build offsets.

## Decision

**One record, versioned as `schema = 1`: built by the Lua API in the game as plain tables, written
as JSON lines for everything outside it, and defined once, for the outside, by a Zod schema that the
tests check the Lua output against.**

### In the game

- **`A7X` is the only public global**, API 1.0: `version`, `status`, `get`, `list` and the console
  helper `show`. `a7xapi.lua` keeps the offsets, walker, JSON writer and formatter as locals and
  clears their globals.
- **The API takes the native table private** on the first call that finds `A7X_native`: it keeps
  the table and clears the global, so no other Lua can read memory. Lazily, because the API may load
  before the library registers the table. The project's check scripts, which need it, run in
  sessions that do not load the API.
- **Plain Lua tables, fresh on every call**, so a consumer cannot change the inspector's state, and
  no call raises: a failure is `nil` and a reason.
- **A record holds only fields a check has proven** (`verify-derived-values.md`); unread values make
  no record rather than a guessed one.

### At the boundary

- **`A7XDATA\t<json>` lines through `Infinity_Log`**, one per record shown: the same channel the
  checks use, captured by `play`. The writer sorts keys, so the same record is the same line.
- **The JSON writer is the project's own** (`a7xjson.lua`, encode only), because the output must be
  deterministic and the project needs nothing else.

### The definition

- **A Zod schema** (`src/model/schemas.ts`, `jsr:@zod/zod@4`) is the one definition outside the game:
  the TypeScript type comes from it, `deno task verify` checks every `A7XDATA` line with it, and
  `deno task schema` generates `docs/data-model.schema.json` from it for tools that do not use
  TypeScript. Objects are strict: an unknown field fails.
- **The same kind of schema defines every line the game writes**, folded in on 2026-11-14 after
  code review ([central schemas plan](../plans/2026-11-14-central-schemas.md)): the checks' `A7XCHECK`,
  `A7XLIST` and `A7XSPAWN` lines are JSON too, each a discriminated union by `kind` in the same
  file, `src/model/schemas.ts`, which holds every data shape in the project and every type, inferred
  from the schemas. The code that judges each check switches over every kind, and TypeScript refuses
  to compile it while a kind is unhandled.
- **One golden file per prefix ties the two languages**: `test/fixtures/` holds what the Lua writes
  for the fake game (`a7xdata.txt`, `a7xcheck.txt`, `a7xlist.txt`, `a7xspawn.txt`); each Lua test
  requires exactly those lines and the Deno test requires each to pass its schema.
- **Versioning:** adding an optional field keeps `schema = 1`; renaming, removing or changing a
  field's meaning bumps it, with the schema, the spec and this ADR in the same change. Adding an API
  function is a minor version, changing or removing one a major.

## Options considered

- **One Zod schema outside, a tested Lua producer inside** (chosen): one definition where types exist,
  and the Lua side held to it by a shared file, at no cost in the game.
- **Text lines for the checks, with a regex parser and a hand-written type beside each** (what the
  Phase 3 checks used until 2026-11-14): two things then defined each format, the Lua that wrote it
  and the parser that read it, with nothing tying the two together.
- **A hand-written TypeScript guard and types**: no dependency, but the type, the check and a JSON
  Schema would be three things to keep in step by hand.
- **TypeSpec**: designs HTTP and RPC APIs and emits JSON Schema; its compiler is a Node and npm tool,
  which the toolchain excludes, and it has no Lua output.
- **Lua libraries in the game**: dkjson encodes JSON but orders keys only from a hand-written list;
  tableshape checks table shapes but would be a second definition of the record, comes as
  MoonScript in several files, and loads through `require`, which `Infinity_DoFile` does not
  replace. Either means vendoring and a check on every call in play.
- **Hono, Drizzle**: an HTTP framework and a SQL ORM. Nothing here serves HTTP or stores data;
  either may fit a later viewer serving `A7XDATA` on localhost, or storage, which is BG2EE-GameLog's.
- **Exposing the walker or the native table to other mods**: not taken, as in ADR-0002.

## Consequences

- A field enters the record only after a check proves it; game time, the pause state and spells come
  with Phase 5 as optional fields.
- A schema change touches the Zod schema, `deno task schema`'s generated file, `docs/data-model.md`,
  the Lua API and the golden file; the tests fail until all agree.
- The check scripts cannot run in a session that has loaded `a7x`.
- The project depends on one library, outside the game only; `deno.lock` pins it.
