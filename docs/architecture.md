# Architecture

How the inspector is organized, what runs where, and the order things happen in. Each diagram is a
Mermaid block, which GitHub renders and VS Code previews with a Mermaid extension. The decisions behind
these diagrams are in [ADR-0001](adr/0001-native-dylib-injection.md) and
[ADR-0002](adr/0002-read-only-bridge-lua-walker.md). Most of this is still to be built; the
[foundation plan](plans/2026-11-01-inspector-foundation.md) says in which step.

## Roadmap

The steps and phases of the first release. Each diamond is a gate that must pass before work continues.

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

Where each part of the repo ends up when it is built and installed.

```mermaid
flowchart TD
  subgraph REPO["BG2EE-Inspector repo"]
    N["native/ a7x.c, builds.h"]
    M["mod/inspector/ inspector.tp2, lib/a7x_*.lua"]
    T["src/ Deno, by concern: tasks, shared, lint, setup, re, game, gamefiles, model, verify"]
    X["test/ Deno tests, test/lua, test/e2e"]
    D["docs/ rules, adr, plans, notes, specs"]
    E["examples/consumer-mod/"]
    V["vendor/ gitignored: weidu, lua-5.2.4"]
  end
  subgraph GAME["Game install and user folder"]
    DY["a7x.dylib, built output"]
    OV["override/ ui.menu patch, a7x_*.lua"]
    SV["save/ A7X-E2E-* slots during e2e only"]
  end
  N -- "deno task build: clang -arch arm64" --> DY
  M -- "deno task install-mod: WeiDU from vendor/weidu" --> OV
  T -- "deno task e2e" --> SV
  V -. "used by" .-> T
```

### src layout

`src/` is grouped by concern, and a folder is created only when its first file arrives:

| folder | holds | from |
| --- | --- | --- |
| `src/tasks/` | one thin entry point per `deno task`, each `await runTask(main)` | Step 0 |
| `src/shared/` | `deno_version.ts`, `task.ts` (the runner), `repo_files.ts`; later `config.ts`, `sha256.ts` | Step 0 |
| `src/lint/` | `docs.ts`, `security.ts` | Step 0 |
| `src/setup/` | doctor checks, WeiDU and Lua downloads | Step 1 |
| `src/re/` | Mach-O and arm64 helpers, `derive.ts` for `native/builds.h` | Phase 1 |
| `src/build/` | building and checking the dylib, shared by `build` and `doctor` | Phase 0 |
| `src/game/` | launcher, redaction, WeiDU install, e2e save handling | Phase 0 onward |
| `src/gamefiles/` | `.cre`, `.spl`, `dialog.tlk` readers adapted from BG2EE-GameLog | Phase 3 and 5 |
| `src/model/` | schema-1 types and guard, captured-session parsing | Phase 3 and 4 |
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
    subgraph NAT["a7x.dylib, native, read-only"]
      CT["constructor: LC_UUID lookup; interposed glClear registers once, then passes through"]
      RD["A7X_native: Read, ReadBlock, Root via mach_vm_read_overwrite"]
    end
    subgraph LUA["Inspector Lua, in override/"]
      WK["a7x_walk.lua + a7x_effects.lua: named fields, bounded walks"]
      OF["a7x_offsets_273_arm64.lua: names to numbers"]
      API["a7x_api.lua: public A7X table, schema 1"]
      FM["a7x_format.lua"]
      TR["triggers: e hotkey, console A7X.show"]
      TS["a7x_test.lua: A7XT, dev component only"]
    end
  end
  RD -- "reads memory of" --> ENG
  CT -- "registers into" --> LUAVM
  WK --> RD
  WK --> OF
  API --> WK
  FM --> API
  TR --> FM
  TS --> API
  EXT["External mods, e.g. a future UI mod"] -- "A7X.get, A7X.list" --> API
  FM -- "Infinity_DisplayString" --> MSG["Message window, shown by the debug console"]
  API -- "Infinity_Log A7XDATA json" --> OUT["stdout via script pty"]
  OUT --> DENO["Deno: verify, e2e, GameLog"]
```

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
  participant A as a7x.dylib
  participant G as Game engine
  participant L as Lua in ui.menu
  P->>S: script -q /dev/null env DYLD_INSERT_LIBRARIES=a7x.dylib game
  S->>DY: exec game with DYLD_INSERT_LIBRARIES
  DY->>A: load and run constructor, before main
  DY->>DY: bind the game's glClear calls to a7x_glClear, from the interpose section
  A->>A: read LC_UUID, find builds.h entry, add ASLR slide
  A->>A: verify expected bytes at every address
  alt unknown build or mismatch
    A-->>G: log A7X disabled, glClear only passes through
  end
  G->>G: main, create the Lua state, register Infinity_* functions
  G->>L: load ui.menu, Infinity_DoFile a7x lua files
  Note over L: A7X_native may not exist yet: status() is no_native
  G->>A: glClear, once a frame on the main thread
  A->>A: Lua state set and idle? if not, wait for the next frame
  A->>L: register A7X_native table with the game's lua_pushcclosure and lua_setglobal
  A->>G: from now on, every call passes straight to the real glClear
  L->>L: on first use, a7x_api captures A7X_native as locals, sets the global to nil
  Note over L: A7X.status() is loading until a game is loaded, then ok
```

## Inspect workflow

What happens when the `e` key is pressed over a creature or a portrait. Output happens only on a request
like this; nothing prints automatically.

```mermaid
sequenceDiagram
  autonumber
  actor U as Player
  participant UI as ui.menu hotkey button
  participant API as A7X API
  participant W as Walker
  participant N as A7X_native
  participant OUT as Message window and stdout
  U->>UI: press e while hovering a creature or portrait
  UI->>API: A7X.inspectUnderCursor()
  API->>API: status() == ok?
  alt not ok
    API->>OUT: one line naming the status, e.g. no_native
  else ok
    API->>W: portrait hovered? mouseOverPortrait, else picked object
    W->>N: bounded reads: object type, EA, derived stats, timed effects
    N-->>W: values, or nil for a bad pointer
    W-->>API: schema-1 table, fresh copy
    API->>OUT: formatted lines via Infinity_DisplayString
    API->>OUT: A7XDATA json via Infinity_Log
  end
```

## Game updates

What happens when Steam patches the game, and how the inspector is brought back.

```mermaid
flowchart TD
  A["Steam updates the game"] --> B["doctor: unknown SHA-256"]
  A --> C["dylib: unknown LC_UUID, A7X disabled, game unaffected"]
  B --> D["deno task derive on the new binary"]
  D --> E["New builds.h entry + new a7x_offsets_build.lua"]
  E --> F["Phase 3 and 5 gates via A7XT.run all or deno task e2e"]
  F --> G{"pass?"}
  G -- yes --> H["Add SHA-256 to doctor's known list, delivery note"]
  G -- no --> D
```
