---
title: "The interposing hook and its probe: Delivery Notes"
description: "Phase 1 found no luaL_Reg table, so the planned hook was impossible. The library now interposes glClear through dyld, as a probe that only reports thread, Lua state and call counts. ADR-0005 records why; a hardened-runtime stand-in confirms the mechanism and the role of the entitlements; the in-game gate is still to run."
---

# The interposing hook and its probe: Delivery Notes

> Delivery record for the hook decision made during Phase 1 of the
> [foundation plan](../plans/2026-11-01-inspector-foundation.md), on `initial/04-reverse-engineering`.
> The decision is [ADR-0005](../adr/0005-dyld-interposing-hook.md); it replaces the hook in
> [ADR-0002](../adr/0002-read-only-bridge-lua-walker.md).

## Status

**Built and checked outside the game; the in-game hook gate has not run yet.** Committed on
`initial/04-reverse-engineering` as four focused commits (decision, enforcement, probe, this note), each
passing lint on its own, and pushed with `main` fast-forwarded to it.

| Piece | State |
| --- | --- |
| Phase 1 finding: no `luaL_Reg` table | Done; evidence in ADR-0005 |
| `lua_pushcclosure` and `lua_setglobal` identified | Done; matched against stock 5.2.4 |
| `native/a7x.c`: the `glClear` probe | Done; builds, passes `lint:security` |
| `native/builds.h`: the first address table entry | Done, by hand; `deno task derive` comes later |
| `lint:security`: no `mprotect`, allowlisted interposing | Done, with failing probes |
| ADR-0005, and ADR-0001, ADR-0002, plan, architecture, rules, skill updated | Done |
| Interposing under the hardened runtime | Checked on a stand-in executable |
| Hook gate in the game | **Not run**; steps below |

## Plan summary

### How the decision was reached

1. **The finding.** Phase 1 looked for the `luaL_Reg` table that ADR-0002's hook would edit, and found
   none: the game registers its 146 `Infinity_*` functions one by one, in code. Code cannot be patched
   under the hardened runtime, so the planned hook had nothing to work on.
2. **The first proposal** was dyld interposing of an imported function the game calls every frame,
   described as "dyld's own mechanism … made for `DYLD_INSERT_LIBRARIES`".
3. **Review questioned it** as hacky and suspect, and asked what dyld is. Checking the claim showed it
   overstated: dyld implements interposing and Apple's AddressSanitizer runtime relies on it, but the
   header defining it is not in the macOS SDK and `man dyld` does not mention it. The correction is in
   ADR-0005.
4. **Alternatives were checked rather than assumed.** The most attractive one, letting the game's Lua
   load the library itself through `package.loadlib`, turned out to be compiled out of this build.
5. **Decision:** interpose `glClear`, staged as a probe that only observes, with a gate in the game
   before registration is written. ADR-0005 states why the route was forced, why it beats the
   alternatives, why it is a hack, and why it works.

### What the probe does

The library still prints its load marker. Then it:

- matches the game's `LC_UUID` against `native/builds.h`, and reads no game memory on a mismatch;
- interposes `glClear`, and on every call does its checks and then calls the real `glClear`;
- reports the first call and its thread, any call off the main thread, the moment the engine's
  `lua_State*` global becomes non-null, and every 3600 calls how many found Lua in the middle of
  running code.

It registers nothing into Lua and writes no game memory.

## What was built

### Code

The changes, by file:

| Path | Change |
| --- | --- |
| `native/a7x.c` | The probe: `A7X_INTERPOSE` macro, build check, `a7x_glClear` |
| `native/builds.h` | New: one entry for 2.7.3 arm64, its `LC_UUID` and the `lua_State*` global offset; the two `lua_State` field offsets the idle check uses |
| `src/build/dylib.ts` | Links `-framework OpenGL`, so the library can call the real `glClear` |
| `src/lint/security.ts` | `MPROTECT_MARKER` replaced by `ALLOWED_INTERPOSE`; `checkNative` now rejects any `mprotect`, any interposed function outside the allowlist, any `__interpose` section outside the macro, and more than one section |
| `test/lint/security_test.ts` | Probes for each of those rules |
| `test/build/dylib_test.ts` | The OpenGL link flag |

`lint:security` before and after:

| | Before | After |
| --- | --- | --- |
| `mprotect` | Allowed once, on a line carrying the marker | Never |
| Interposing | Not checked | Only through `A7X_INTERPOSE`, only for `glClear`, one section |
| Write calls (`mach_vm_write` and others) | Forbidden | Forbidden |

### Docs

Every page that described the old hook now describes the new one:

| Page | Change |
| --- | --- |
| `docs/adr/0005-dyld-interposing-hook.md` | New |
| `docs/adr/0002-read-only-bridge-lua-walker.md` | Description, the macOS constraint, and the hook bullet point to ADR-0005; the rest stands |
| `docs/adr/0001-native-dylib-injection.md` | The single hook is now the interposed import |
| `docs/plans/2026-11-01-inspector-foundation.md` | Phase 1 step 1 marked done with its result; Phase 2 hook; diagrams; lint rule; the data-model ADR renumbered to 0006 |
| `docs/architecture.md` | Runtime-layers node and boot sequence |
| `docs/rules/security-first.md`, `.claude/skills/security-audit/SKILL.md` | No `mprotect`; the interposing allowlist; the pass-through check |
| `CLAUDE.md` | `native/` now holds `builds.h` |

## Gotchas worth remembering

- **A signed comparison hid every cross-reference.** JavaScript's `&` returns a signed 32-bit number,
  so masks compared with constants at or above `0x80000000` (the `ADRP`, `ADD` and `LDR` encodings)
  never matched, and the first scan reported no references at all. `>>> 0` makes the result unsigned.
  `llvm-objdump` output exposed it; the repo's scanner (Phase 1) gets tests against that output.
- **A scan window needs to stop at a register's redefinition.** The scratch scanner paired an `ADRP`
  with any `ADD` on the same register within 24 instructions, which produced false pairs once the
  register had been reloaded.
- **`llvm-objdump --start-address` ignores the range on a universal binary** and disassembles all of
  it (47 MB of output). Extract the slice first with `lipo -thin arm64`.
- **Apple's macro declares the section as `__DATA,__interpose,interposing`.** The third part sets the
  section type to `S_INTERPOSING` (`flags 0x0000000d` in `otool -l`). The probe matches it; the linter
  accepts either form so it cannot be bypassed by dropping the type.
- **The game is arm64, not arm64e.** Apple's macro adds pointer-authentication qualifiers for arm64e; an
  arm64 library loaded into an arm64 process needs none.
- **The library's own calls are not interposed.** That is what lets `a7x_glClear` call the real
  `glClear` by name. The stand-in shows it: the same OpenGL error code after the loop, with and without
  the library.

## Verification

Run on 2026-11-01:

- **Binary evidence**, re-checked before ADR-0005 was written:
  - `"Infinity_Log"` at `0x100653aee`; no 8-byte pointer to it in `__DATA_CONST` or `__DATA`.
  - The registration function at `0x100335440`: `adrp`/`add` to `0x1035d7478` into `x21`, then the
    pattern shown in ADR-0005; 146 calls to `0x10054bd88` and 147 to `0x10054b520` in it, against 146
    `Infinity_*` strings in the binary.
  - `0x10054b520` and `0x10054bd88` compared instruction by instruction with `lua_pushcclosure` and
    `lua_setglobal` in the vendored 5.2.4 `lapi.c`; `offsetof` on the vendored source compiled for
    arm64 gives `top` 16, `l_G` 24, `ci` 32, `base_ci` 128.
  - `loadlib.c`'s `DLMSG` string is present in the binary, so `package.loadlib` is compiled out.
  - `nm -u` lists `_glClear`, `_glFinish` and `_glViewport` among the game's imports.
- **`deno task build`**: `build/a7x.dylib`, arm64, `Signature=adhoc`; `otool -l` shows one
  `__DATA,__interpose` section of 16 bytes (one pair) with type `S_INTERPOSING`; `otool -L` lists
  OpenGL.
- **Stand-in executable** (a C program making an offscreen OpenGL context and calling `glClear` 7300
  times on its main thread), ad-hoc signed with the hardened runtime:
  - **With the game's two entitlements:** the library loaded, reported an unknown build (so no memory
    reads), saw the first call on the main thread, counted 3600 and 7200 calls, and the program
    finished normally.
  - **Without them:** no output from the library; macOS did not load it.
  - **Without the library:** the same final OpenGL error code as with it, so calls pass through.
- **`deno task test`**: 68 passed. **`lint:security`**: no findings; a copy of `a7x.c` with
  `A7X_INTERPOSE(my_open, open)` added gets one `native-interpose` finding.
- **Not run:** the game. The probe has not been loaded into BG2:EE yet.

### Still to check by hand

1. The hook gate (ADR-0005): run the [hook gate manual test](../manual-tests/hook-gate.md), which has the
   steps, timings and pass criteria. The game is launched only on request.

## Follow-ups

- **Run the hook gate** above; record the result in its own delivery note and the manual test's Runs
  table, then mark ADR-0005 active or re-evaluate it.
- **Then registration** (Phase 2): replace the probe's reporting with one registration of the
  `A7X_*` functions through the game's `lua_pushcclosure` and `lua_setglobal`, plus the expected-byte
  checks at those two addresses.
- **Phase 1 tooling:** `src/re/macho.ts` sections, strings, pointer scans and the `ADRP` resolver with
  tests; `deno task derive` generating `native/builds.h`; `docs/re-notes.md`.
- **The play summary shows only the load marker.** The probe's lines are in the session log; printing
  every `A7X` line in the summary would save the `grep`.
