---
title: "One schema for every line: catching drift between two languages"
description: "How code review found the checks' log formats defined twice, once by the Lua that writes them and once by the TypeScript that reads them, and how JSON lines, one central Zod schema file as the single source of truth, inferred types, shared golden files and exhaustive switches close each gap. Includes what the types caught during the change itself, and how the review overturned assumptions back to the plans."
---

# One schema for every line: catching drift between two languages

A learning piece from the inspector's verify tooling. The project has a Lua side, scripts that run in
the game and write lines to its log, and a TypeScript side, `deno task verify`, that reads those lines
afterwards and judges them. Whenever two programs in two languages share a format, the format exists
twice, and the two copies can drift apart without either side's tests noticing. This piece shows
where that was happening, what replaced it, and why each piece of the replacement catches a
different kind of drift. The worked example is a game log, but the shape is general: any producer
and consumer that share a data format across a language or process boundary.

## The drift found in review

The public record (`A7XDATA`) was already safe: its TypeScript type was inferred from a Zod schema,
and a golden file tied the Lua that writes it to that schema. The three checks were not. Each wrote
its own text format, and each format lived in three places:

- the **Lua script** that wrote it (`test/lua/a7xchk.lua`, `a7xlist.lua`, `a7xspawn.lua`);
- a **regex parser and a hand-written type** in its own verify module (`src/verify/checks.ts`,
  `list.ts`, `spawn.ts`);
- **two separate sets of test strings**: the Lua test checked the script against the strings it
  expected, and the Deno test checked the parser against the strings it expected.

A spawn-check line looked like this:

```text
A7XSPAWN 2 creature 143067270 resref=DADROW8 block=derived hp=34/34 ac=6,0,0,0,0 thac0=18 saves=13,9,11,13,10 resist=0,0,0,0,0,0,0,0,0,0 mr=66 ea=128
```

The resistances are ten numbers by position. The Lua side wrote them in the walker's order
(`A7XWALK.RESISTS`); the TypeScript side read them as

```ts
/** The walker's resistance order (A7XWALK.RESISTS): the file's, without magic resistance. */
const WALKER_RESISTS = CRE_RESISTANCES.filter((r) => r !== "magic");
```

which is true today, and stated nowhere a test could check. Reorder either list and every
resistance would be compared with the wrong one, with both sides' tests still green.

The types beside the parsers were no better anchored:

```ts
export type Field = { field: string; ok: boolean; walker: string; engine: string };
export type Member = { id: string; fields: Field[]; skip?: string };
export type Run = { run: number; party?: number; error?: string; members: Member[] };

const LINE = /A7XCHECK (\d+) (\S+) (.*)$/;
const FIELD = /^(\S+) (ok|DIFF) walker=(.*) \| engine=(.*)$/;
```

Every value is a `string`, ids included, because that is what a regex hands back. The type describes
the parser's output, not the data, and it lives in a different file from every other shape.

## After

Every line the game writes is now `<PREFIX>\t<json>`, written by the same JSON writer the record
uses (`a7xjson.lua`); here shortened:

```text
A7XSPAWN	{"ac":{"crushing":0,"missile":0,"piercing":0,"slashing":0,"value":6},"block":"derived","ea":128,"hp":{"cur":34,"max":34},"id":143067270,"kind":"creature","mr":66,"resist":{"acid":0,"cold":0,...},"resref":"DADROW8","run":2,...}
```

Every shape is defined once, in one file, `src/model/schemas.ts`, as a Zod schema; each check's lines
are a discriminated union on `kind`, and every type is inferred from its schema:

```ts
export const SpawnLine = z.discriminatedUnion("kind", [
  z.strictObject({
    run: int,
    kind: z.literal("spawn"),
    resref: z.string(),
    ok: z.boolean(),
    why: z.string().optional(), // only when it failed
  }),
  z.strictObject({
    run: int,
    kind: z.literal("creature"),
    id: int,
    resref: z.string(),
    block: z.enum(["derived", "temp"]),
    hp: Hp,
    ac: z.strictObject({ value: int, crushing: int, missile: int, piercing: int, slashing: int }),
    thac0: int,
    saves: integers(SAVES),
    resist: integers(RESISTS),
    mr: int,
    ea: int,
  }),
  z.strictObject({
    run: int,
    kind: z.literal("header"),
    id: int,
    hex: z.string().optional(), // left out when unreadable
  }),
  z.strictObject({ run: int, kind: z.literal("error"), why: z.string() }),
]);

export type SpawnLine = z.infer<typeof SpawnLine>;
```

Resistances are now an object keyed by name, so there is no order to agree on. One function,
`parseLines(log, prefix, schema)`, finds a prefix's lines, parses them and validates them, for every
prefix. Each verify module folds its typed lines into runs with a `switch` over every kind, ending in

```ts
default:
  exhaustive(line); // (line: never) => never
```

so TypeScript refuses to compile the module while a kind in the schema has no case.

## A single source of truth

Before the change, the TypeScript side described the game's data in five files, each in its own way:

| File | What it held |
| --- | --- |
| `src/model/schema.ts` | the record's Zod schema and its inferred type |
| `src/verify/checks.ts` | three hand-written types (`Field`, `Member`, `Run`) and three regular expressions for the party check |
| `src/verify/list.ts` | three hand-written types and four regular expressions for the creature list |
| `src/verify/spawn.ts` | three hand-written types, a regular expression, and the positional field table `LISTS` |
| `src/verify/data.ts` | one hand-written type and a regular expression for the record's lines |

Ten hand-written types and nine regular expressions, each a separate statement of what some line
looks like. After it, every data shape is in `src/model/schemas.ts`, in one order: shared pieces, the
record, then one section per check, then the run types built from them. No line type is written by
hand: each is inferred from its schema, and the run types are composed only of inferred line types
and plain values. The verify modules import their shapes and define none.

What a single source of truth gives:

- **One place to understand the data.** To learn what the party check writes, or what a spawned
  creature's line holds, there is one file to read, top to bottom, with each schema's comment naming
  the Lua script that writes it and the manual test that uses it. Before, the answer was spread over a
  Lua script, a regular expression, a type and a test file, and the type described the parser's
  output (every value a string) rather than the data.
- **No copy to drift from.** A type cannot disagree with its schema, because there is no second
  statement of it; a field added to a schema appears in the type at once, everywhere it is used.
- **Shared parts are shared, not repeated.** `SAVES`, `RESISTS`, `Hp` and `integers` are defined once
  and used by the record and the spawn line alike, so "the ten resistances" means the same names in
  every shape that has them. Before, the record listed them in `schema.ts` and the spawn check derived
  its own order in `spawn.ts`, from the `.cre` reader's list.
- **Changes have one starting point, and the compiler finds the rest.** A data change begins in one
  file; every module that depends on the changed shape fails to compile until it agrees ("What the
  types showed during the change itself", below, shows this happening).
- **Review has one place to look.** A pull request that changes a data shape changes
  `src/model/schemas.ts`, so a reviewer sees every format change in one diff, and one that does not
  touch the file does not change any format.

Two things stay outside it, deliberately. The `.cre`, `chitin.key` and BIFF readers' types
(`src/gamefiles/`) describe binary game files the inspector reads, not lines it writes, and live
with the code that decodes those bytes. And the Lua side cannot import TypeScript, so its shapes
remain in Lua; the golden files are what hold it to the single source.

## Each layer catches a different drift

No single mechanism covers a format shared across two languages; each of these closes one gap:

| Drift | Caught by | How |
| --- | --- | --- |
| A type and its schema | inference | every type is `z.infer` of a schema; there is no second copy to drift |
| The Lua writer and the schema | golden files, checked from both sides | `test/fixtures/a7xcheck.txt`, `a7xlist.txt`, `a7xspawn.txt` and `a7xdata.txt` hold what the Lua writes for the fake game; each Lua test requires exactly those lines, and `test/model/schemas_test.ts` requires every one to pass its schema |
| The schema and the code that judges it | exhaustive `switch` | a new kind is a compile error until it is handled |
| The schema and the docs | tests over the docs | the record's prose spec and its generated JSON Schema are compared with the Zod schema |
| A real session and all of the above | `deno task verify` | any line that does not match its schema fails the run, naming its log line |

The golden file is the piece that reaches across the language boundary. Neither side can see the
other's code, but both can be held to the same bytes.

## What the types showed during the change itself

Halfway through the change, with the verify modules returning typed lines, the next step read:

> The verify task's call sites all change shape, so I'll rewrite the file. Schema problems on any
> line now fail the run too.

Both halves of that sentence are the point of the change, seen from the inside.

**"The call sites all change shape."** Once the parsers returned typed results, `deno check` on the
untouched `src/tasks/verify.ts` reported **20 errors**, each naming a line that the change broke;
four of them, with paths shortened:

```text
TS2305 Module '"…/src/verify/checks.ts"' has no exported member 'parseDumps'.
TS2339 Property 'length' does not exist on type '{ runs: CheckRun[]; problems: string[]; }'.
TS2345 Argument of type '{ runs: SpawnRun[]; problems: string[]; }' is not assignable to parameter of type 'SpawnRun[]'.
TS7006 Parameter 'm' implicitly has an 'any' type.
```

That is a complete, ordered to-do list for the rewrite, produced by the compiler. With the old
`string` fields and `Map<string, string>` values, the same change would have compiled; code such as
`c.ea.padEnd(3)`, which formatted the EA for the report, worked only because the EA happened to be a
string, and would have failed at run time, or printed nonsense, once it became a number. With types
from the schema, the compiler finds those places before anything runs.

**"Schema problems on any line now fail the run."** The old parsers skipped what they did not
recognise:

```ts
const m = raw.trimEnd().match(LINE);
if (!m) continue;
```

A malformed line, a renamed field or a new line kind was silently dropped, and the run was judged
without it. Now `parseLines` reports every line that fails its schema, with its log line number, and
`deno task verify` fails the run. A format change that one side forgot is a failure at the first run,
not a quiet gap in the evidence.

## How the code review changed assumptions back to the plans

This change did not start as a design decision. It came out of a line-by-line review of code that
already worked and had passed its tests and its manual tests, in this order:

1. **How is the record's schema enforced?** Earlier the same day, a question about the public record
   ("TypeScript? SQL?") showed that the Phase 4 plan's hand-written TypeScript guard would leave the
   type, the check and a JSON Schema as three things to keep in step. Zod replaced it before the code
   was written.
2. **Is there a more declarative way to write this?** Three readability questions about the spawn
   check's verifier (`creatureValues`, `parseSpawns`, `fileValues`) led to the refactors in
   [the earlier learning note](2026-11-14-declarative-line-parsing.md): tables of fields and line
   kinds instead of statements.
3. **Should these types be in a separate file, and how do they relate to the schema?** Answering this
   required reading the types next to the Lua that produced their data, and that is where the
   duplication showed: each check's format defined once in Lua and again in a parser, joined by
   nothing.

Each answer overturned an assumption an approved plan had made:

| Plan | Assumed | Replaced by |
| --- | --- | --- |
| [Foundation plan](../plans/2026-11-01-inspector-foundation.md) | a hand-written parse guard (`src/model.ts`) and a contract test (`test/model_test.ts`) for the record | a Zod schema with inferred types, a generated JSON Schema, and golden files |
| [Party walker plan](../plans/2026-11-06-party-walker.md) | text lines (`A7XCHECK <id> <field> walker=<v> engine=<v> <ok\|DIFF>`) parsed by regex in `verify` | JSON lines defined in `src/model/schemas.ts` |
| [Creature list](../plans/2026-11-13-creature-list.md) and [spawn harness](../plans/2026-11-13-spawn-harness.md) plans | the same text-line pattern, carried over | the same JSON lines and schemas |
| [Data API plan](../plans/2026-11-14-data-api.md) | a hand-written TypeScript guard and types | Zod, decided before implementation |

Why did the assumptions survive until then? Each plan was reviewed on its own, and each was
internally sound: a text line and a regex is a reasonable way to read a log. The duplication only
appears when the Lua that writes a line and the TypeScript that reads it are read side by side, and no
single plan or file put them side by side. The third check reused the pattern because the first two
had worked.

What to take from it:

- **Read code across the boundary it crosses.** A format shared by two programs is reviewed properly
  only with both programs open.
- **Treat an approved plan's mechanisms as revisable.** A plan fixes goals and decisions; its choice of
  mechanism is a starting point, to be replaced when the code shows a better one. The plans here are
  left as they were approved and pushed; this note and ADR-0006 record what replaced their mechanisms.
- **Small questions find large problems.** Each review question was about one function's
  readability or one type's location; the structural problem was found by following them.

## What the first run in the game found

The first party check with JSON lines passed every compared field, and still showed something wrong:
the list of offsets that read 2 in every sprite dump, one of its pass criteria, was missing. Every
`dump` line in the log was exactly 4164 characters long and ended in the middle of its JSON:

```text
… INFO: LUA: A7XCHECK	{"hex":"703edd000100000031110000e81000009a0200000000000000107f40…
```

The game's log keeps at most 4084 characters of an `Infinity_Log` message and drops the rest without
a sign. That was not new. The Phase 3 logs show every text-format dump cut at the same length, about
2032 of its 2048 bytes; the old regular expression matched whatever hex was left, the search ran on
the shorter dumps, and nobody noticed. (The EA at `+0x38` lies well inside what survived, so no Phase 3
conclusion changes.)

Two lessons, one about each side of the boundary:

- **A strict format makes a silent limit loud, but only if the reader is strict about where a line
  ends.** The first `parseLines` took the JSON to be everything between the first `{` and the last
  `}`. A cut line has no last `}`, so it matched nothing and was skipped, exactly as the regular
  expressions had skipped malformed lines. Now everything from the first brace is the JSON, so a cut
  line fails to parse, is reported with its log line, and fails the run. Running the new `verify` on
  that session's log reports all six cut lines.
- **The writer should refuse what the channel cannot carry.** `A7XJSON.line(prefix, value)`, now the
  one function every Lua writer uses, returns no line and a reason when the line would be longer than
  4000 characters, so a line is written whole or replaced by an error line, never cut. The dump is
  written in 512-byte lines, each with its offset, which `verify` places back at their offsets.

Moving every writer onto the shared `A7XJSON.line` also showed why a single source needs care inside
Lua: the function first looked itself up through the global `A7XJSON`, which the public API clears
after loading. The API's own test failed at once (no record lines written), and the module now refers
to itself through a local, as the walker already did.

Some limits only show in the real engine: the fake game in the tests had no log to cut. The value of
the strict format is that when the real run meets such a limit, it fails with a line number instead
of passing with less evidence.

## A result: the data flow could be drawn

With every shape in one file, a question asked right after the change, whether an architecture
document could show the data flow from the schemas to every output, had a short answer. The
[Data flow](../architecture.md#data-flow) section of `docs/architecture.md` now has two diagrams:
the path of a line from game memory through the Lua writers, the JSON writer and the log to
`deno task verify`, and how every part is tied to `src/model/schemas.ts`, each arrow labelled with
what enforces it. A table gives each prefix's writer, schema, golden file and reader.

That was only possible because there was one place to draw from. Before, the same diagram would have
had five sources of truth on the TypeScript side alone, and the honest version of it would have been a
map of where they could disagree. Drawing it also showed how stale the old picture was: the page's
runtime diagram showed only the record's JSON, named `a7x_api.lua` (the file is `a7xapi.lua`), and
described `src/model/` as "schema-1 types and guard". A single source of truth makes the
architecture of the data something that can be written down once and checked, instead of rediscovered
by reading every file.

## What it costs

- **Logs from earlier runs can no longer be judged.** The Phase 3 manual tests' session logs are text;
  their results stay recorded in the delivery notes, and test results were never meant to be replayed.
- **One more file in the game for each check**: the JSON writer is copied into `override/` with the
  walker for every check session.
- **Longer lines.** JSON repeats its keys; for a log read by programs, that is cheap.
- **Golden files to regenerate.** A deliberate change to what a script writes means regenerating its
  golden file and reviewing the difference. That review is the point: it is where a format change is
  seen by a person before either side depends on it.
