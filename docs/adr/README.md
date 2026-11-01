# Architecture decision records

One file per decision, numbered in order. New ADRs start from [the template](0000-template.md) and are
added to this list; `lint:docs` fails on an ADR that is not linked here or breaks the numbering.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-native-dylib-injection.md) | Load a native library with `DYLD_INSERT_LIBRARIES` on BG2:EE 2.7.3 | active |
| [0002](0002-read-only-bridge-lua-walker.md) | A read-only native bridge, struct walking in Lua, data-first output | proposed (Phase 3 gate) |
| [0003](0003-toolchain.md) | C with the Command Line Tools, Deno orchestration, Lua 5.2.4 as reference | active |
| [0004](0004-project-conventions.md) | One `docs/` folder, enforced rules, MIT | active |
