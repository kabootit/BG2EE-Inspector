# Architecture

How the inspector fits together, what runs where, and the order things happen in. Each diagram is a
Mermaid block, which GitHub renders and VS Code previews with a Mermaid extension. The decisions behind
these diagrams are in [ADR-0001](adr/0001-native-dylib-injection.md),
[ADR-0002](adr/0002-read-only-bridge-lua-walker.md) and [ADR-0006](adr/0006-data-model-and-api.md).
Some parts do not exist yet: those marked "later" in the runtime layers; the
[foundation plan](plans/2026-11-01-inspector-foundation.md) says in which step.

## Roadmap

The steps and phases of the first release. Each diamond is a [gate](README.md#terms): a pass/fail
check that must pass before work continues.

```mermaid
flowchart TD
  S0["Step 0: scaffold and conventions"] --> S1["Step 1: requirements, doctor, setup-weidu, setup-dev"]
  S1 --> P0{"Phase 0 gate: dylib loads into the game?"}
  P0 -- no --> FB["Stop: CrossOver + EEex fallback, outside this plan"]
  P0 -- yes --> P1["Phase 1: reverse engineering, derive builds.h"]
  P1 --> P2["Phase 2: bridge dylib, read-only, fail closed"]
  P2 --> P3{"Phase 3 gate: party values match characters[] 100%?"}
  P3 -- no --> P1
  P3 -- yes --> P4["Phase 4: data API, hotkey and console output"]
  P4 --> P5{"Phase 5 gate: countdowns match .spl durations and removal?"}
  P5 -- no --> P1
  P5 -- yes --> R["First release"]
```

## Code organization

Where each part of the repo ends up once the tasks build and install it.

```mermaid
flowchart TD
  subgraph REPO["BG2EE-Inspector repo"]
    N["native/ inspector.c, builds.h"]
    M["mod/inspector/ inspector.tp2, lib/inspector_*.lua"]
    T["src/ Deno, by concern: tasks, shared, lint, setup, re, game, gamefiles, model, verify"]
    X["test/ Deno tests, test/lua, test/e2e"]
    D["docs/ rules, adr, plans, notes, specs"]
    E["examples/consumer-mod/"]
    V["vendor/ gitignored: weidu, lua-5.2.4"]
  end
  subgraph GAME["Game install and user folder"]
    DY["inspector.dylib, built output"]
    OV["override/ ui.menu patch, inspector_*.lua"]
    SV["save/ Inspector-E2E-* slots during e2e only"]
  end
  N -- "deno task build: clang -arch arm64" --> DY
  M -- "deno task install-mod: WeiDU from vendor/weidu" --> OV
  T -- "deno task e2e" --> SV
  V -. "used by" .-> T
```

### src layout

`src/` groups its code by concern, and a folder appears only when its first file arrives:

| folder | holds | from |
| --- | --- | --- |
| `src/tasks/` | one thin entry point per `deno task`, each `await runTask(main)` | Step 0 |
| `src/shared/` | `deno_version.ts`, `task.ts` (the runner), `repo_files.ts`; later `config.ts`, `sha256.ts` | Step 0 |
| `src/lint/` | `docs.ts`, `security.ts` | Step 0 |
| `src/setup/` | doctor checks, WeiDU and Lua downloads | Step 1 |
| `src/re/` | Mach-O and arm64 helpers, `derive.ts` for `native/builds.h` | Phase 1 |
| `src/build/` | building and checking the dylib, shared by `build` and `doctor` | Phase 0 |
| `src/game/` | launcher, redaction, WeiDU install, e2e save handling | Phase 0 onward |
| `src/gamefiles/` | `chitin.key`, BIFF, `.cre` and 2DA readers adapted from BG2EE-GameLog; `.spl` and `dialog.tlk` later | Phase 3 and 5 |
| `src/model/` | `schemas.ts`: every data shape the game writes, one Zod schema each, the types inferred from them, and `parseLines` ([Data flow](#data-flow)) | Phase 4 |
| `src/verify/` | assertions for `deno task verify` and `deno task e2e` | Phase 3 |

The rules, enforced by `test/structure_test.ts`:

- **No loose files** directly in `src/`.
- **Only entry points exit.** `src/tasks/*` and the runner `src/shared/task.ts` are the only code that
  calls `Deno.exit` or reads `Deno.args`, so every library module is safe to import from a test.
- **One way in.** Every task entry point runs through `runTask()`, which checks the Deno version first,
  and every `deno run` task in `deno.json` points at a file in `src/tasks/`.
- **Tests mirror sources:** `test/lint/docs_test.ts` tests `src/lint/docs.ts`.

## Runtime layers

Inside the game process: the engine, its embedded Lua, the read-only native library, and the inspector's
Lua layers. External mods and tools reach only the public API and the JSON output.

```mermaid
flowchart TD
  subgraph PROC["Game process, arm64, hardened runtime"]
    ENG["Engine C++: CInfGame, CGameSprite, CGameEffect"]
    LUAVM["Engine's embedded Lua 5.2 state"]
    subgraph NAT["inspector.dylib, native, read-only"]
      CT["constructor: LC_UUID lookup; interposed glClear registers once, then passes through"]
      RD["Inspector_native: Read, ReadBlock, Root via mach_vm_read_overwrite"]
    end
    subgraph LUA["Inspector Lua, in override/"]
      WK["inspwalk.lua: named fields, bounded walks, a creature's effect lists, the game's clock"]
      OF["inspoff.lua: names to numbers"]
      API["inspapi.lua: public I table, schema 1"]
      FM["inspfmt.lua: text lines"]
      JS["inspjson.lua: JSON lines"]
      TR["triggers: e key button in ui.menu, console I.show"]
      TS["inspector_test.lua: INSPECTOR_T, dev component, later"]
    end
  end
  RD -- "reads memory of" --> ENG
  CT -- "registers into" --> LUAVM
  WK --> RD
  WK --> OF
  API --> WK
  FM --> API
  TR -- "I.show" --> API
  API --> FM
  TS --> API
  EXT["External mods, e.g. a future UI mod"] -- "I.get, I.list, I.hovered, I.portrait" --> API
  FM -- "Infinity_DisplayString" --> MSG["Message window, shown by the debug console"]
  API --> JS
  JS -- "Infinity_Log INSPECTOR_DATA json" --> OUT["stdout via script pty"]
  OUT --> DENO["Deno: verify, e2e, GameLog"]
```

## Data flow

Every piece of data the inspector produces leaves the game in one of three ways: as Lua tables to other
mods, as text in the message window, or as JSON lines in the game's log, which Deno reads afterwards.
A Zod schema in `src/model/schemas.ts` defines every JSON line once; why is in
[ADR-0006](adr/0006-data-model-and-api.md), and the record's fields are in
[docs/data-model.md](data-model.md).

### The path of a line

From game memory to the three outputs, and from the log to a verdict. The check scripts are test tools,
copied into the game only for a manual test; the API is the inspector itself.

```mermaid
flowchart TD
  MEM["Game memory"] --> NAT["Inspector_native: Read, ReadBlock"]
  NAT --> WALK["inspwalk.lua + inspoff.lua: named fields"]
  WALK --> API["inspapi.lua: the I table, schema-1 records"]
  WALK --> CHK["Check scripts, test only: inspchk, insplist, inspspwn"]
  KEY["The e key: a button in ui.menu"] -- "I.show()" --> API
  API -- "I.get, I.list, I.hovered, I.portrait" --> MODS["Other mods: plain Lua tables"]
  API -- "I.show" --> FMT["inspfmt.lua: two text lines per record"]
  FMT -- "Infinity_DisplayString" --> MSG["Message window"]
  API -- "I.show" --> JSON["inspjson.lua: sorted keys, integers kept"]
  CHK --> JSON
  JSON -- "Infinity_Log: prefix, tab, JSON" --> LOG["Game stdout"]
  LOG -- "deno task play" --> CAP["logs/session-*.log"]
  CAP --> PARSE["parseLines in schemas.ts: each line checked against its schema"]
  PARSE --> VER["src/verify: checks.ts, list.ts, spawn.ts fold lines into runs"]
  VER --> REP["deno task verify: the report and its exit code"]
  CAP --> TOOLS["Tools outside the game: checked with data-model.schema.json"]
```

Each prefix, who writes it, what defines it, what pins it and who reads it:

| Prefix | Written by | Schema | Golden file | Read by |
| --- | --- | --- | --- | --- |
| `INSPECTOR_DATA` | `mod/inspector/lib/inspapi.lua`, through `I.show` | `RecordSchema` | `test/fixtures/inspector_data.txt` | `deno task verify`; other tools, through `docs/data-model.schema.json` |
| `INSPECTOR_CHECK` | `test/lua/inspchk.lua` | `CheckLine` | `test/fixtures/inspector_check.txt` | `src/verify/checks.ts` |
| `INSPECTOR_LIST` | `test/lua/insplist.lua` | `ListLine` | `test/fixtures/inspector_list.txt` | `src/verify/list.ts` |
| `INSPECTOR_SPAWN` | `test/lua/inspspwn.lua` | `SpawnLine` | `test/fixtures/inspector_spawn.txt` | `src/verify/spawn.ts`, with the game's `.cre` files |

The two outputs that are not JSON have the same source: the tables `I.get` returns are the records
`INSPECTOR_DATA` carries, before encoding, and `inspfmt.lua` makes the message-window text from them for
people, not programs.

### How every part stays tied to the schema

The schema file is the single source of truth; a test, the compiler or a generated file holds each
other part to it, so a change on one side cannot pass unnoticed on another.

```mermaid
flowchart TD
  SCH["src/model/schemas.ts: one Zod schema per prefix"]
  SCH -- "z.infer" --> TYPES["Every type: lines, records, runs"]
  TYPES -- "exhaustive switch: a new kind will not compile until handled" --> VER["src/verify modules"]
  SCH -- "deno task schema" --> JS["docs/data-model.schema.json"]
  JS -- "test: the file equals the schema" --> SCHT["test/model/schemas_test.ts"]
  LUA["Lua writers: inspapi.lua and the check scripts"] -- "Lua tests: exactly these lines" --> GOLD["test/fixtures: one golden file per prefix"]
  GOLD -- "test: every line passes its schema" --> SCHT
  SCH --> SCHT
  DM["docs/data-model.md: the record's fields"] -- "test: the same fields" --> SPEC["test/model/spec_test.ts"]
  SCH --> SPEC
  LOGS["A real session log"] -- "deno task verify: a line that fails its schema fails the run" --> SCH
```

The Lua side cannot import TypeScript, so the golden files are the link across the language boundary:
the tests hold both sides to the same bytes. How this design came about is in the learning note
[one schema for every line](learnings/2026-11-14-central-schemas.md).

## Boot sequence

From `deno task play` to the API being ready, including the fail-closed path for an unknown build.
`script` runs the game in a pseudo-terminal so its output is line-buffered rather than held in 4 KB
blocks.

```mermaid
sequenceDiagram
  autonumber
  participant P as deno task play
  participant S as script + env
  participant DY as dyld
  participant A as inspector.dylib
  participant G as Game engine
  participant L as Lua in ui.menu
  P->>S: script -q /dev/null env DYLD_INSERT_LIBRARIES=inspector.dylib game
  S->>DY: exec game with DYLD_INSERT_LIBRARIES
  DY->>A: load and run constructor, before main
  DY->>DY: bind the game's glClear calls to inspector_glClear, from the interpose section
  A->>A: read LC_UUID, find builds.h entry, add ASLR slide
  A->>A: verify expected bytes at every address
  alt unknown build or mismatch
    A-->>G: log Inspector disabled, glClear only passes through
  end
  G->>G: main, create the Lua state, register Infinity_* functions
  G->>L: load ui.menu: after combatLog, Infinity_DoFile inspname, then insp, from the WeiDU patch
  Note over L: Inspector_native may not exist yet: status() is no_native
  G->>A: glClear, once a frame on the main thread
  A->>A: Lua state set and idle? if not, wait for the next frame
  A->>L: register the Inspector_native table with the game's own Lua API, under its lua_pcallk
  A->>G: from now on, every call passes straight to the real glClear
  L->>L: on first use, inspapi captures Inspector_native as a local, sets the global to nil
  Note over L: I.status() is loading until a game is loaded, then ok
```

## Inspect workflow

What happens when the player presses the `e` key over a creature or a portrait. Output happens only on
a request like this; nothing prints automatically.

```mermaid
sequenceDiagram
  autonumber
  actor U as Player
  participant UI as ui.menu key button, in WORLD_ACTIONBAR
  participant API as I API
  participant W as Walker
  participant N as Inspector_native
  participant OUT as Message window and stdout
  U->>UI: press e while hovering a creature or portrait
  UI->>API: I.show()
  API->>API: status() == ok?
  alt not ok
    API->>OUT: one line naming the status, e.g. no_native
  else ok
    API->>W: mouseOverPortrait set? that party slot, else the id at CGameArea +0x244
    alt nothing under the pointer
      API->>OUT: the usage line
    else a door, container or region
      API->>OUT: not a creature
    else a creature
      W->>N: bounded reads: object type, id, EA, the current stats block
      N-->>W: values, or nil for a bad pointer
      W-->>API: schema-1 table, fresh copy
      API->>OUT: formatted lines via Infinity_DisplayString
      API->>OUT: INSPECTOR_DATA json via Infinity_Log
    end
  end
```

## Game updates

What happens when Steam patches the game, and how the inspector is brought back.

```mermaid
flowchart TD
  A["Steam updates the game"] --> B["doctor: unknown SHA-256"]
  A --> C["dylib: unknown LC_UUID, Inspector disabled, game unaffected"]
  B --> D["deno task derive on the new binary"]
  D --> E["New builds.h entry + new inspector_offsets_build.lua"]
  E --> F["Phase 3 and 5 gates via INSPECTOR_T.run all or deno task e2e"]
  F --> G{"pass?"}
  G -- yes --> H["Add SHA-256 to doctor's known list, delivery note"]
  G -- no --> D
```
