---
type: ADR
id: "0001"
title: "Load a native library with DYLD_INSERT_LIBRARIES on BG2:EE 2.7.3"
description: "Creature state is unreachable from the game's Lua, and the hardened runtime blocks external memory readers and code patching, so the launcher loads a read-only dylib into the native arm64 2.7.3 game through the entitlements it ships with."
status: active
date: 2026-11-01
---

# ADR-0001: Load a native library with DYLD_INSERT_LIBRARIES on BG2:EE 2.7.3

**Status:** Active (Phase 0 gate passed 2026-11-01) · **Date:** 2026-11-01

## References

- [ADR-0002](0002-read-only-bridge-lua-walker.md): what the library does once loaded.
- [Foundation plan](../plans/2026-11-01-inspector-foundation.md): the research behind this decision.
- BG2EE-GameLog `docs/FINDINGS.md`, "No creature state is reachable from Lua": the reason the project
  needs a native path at all.

## Context

The goal is to show stats and active spells, with time remaining, for any creature. BG2EE-GameLog
established that the game's Lua sandbox cannot reach non-party creature state: the tolua registry has no
sprite, area or effect classes, and `Infinity_UpdateLuaStats()` covers the party only.

Facts checked on the installed game (2026-11-01, read-only):

- **Build:** BG2:EE 2.7.3 (`CFBundleVersion` 2070300) is a universal binary that runs natively on arm64.
  Earlier versions, 2.6 included, are x86_64 only and run under Rosetta.
- **Hardened runtime with two permissive entitlements:** `com.apple.security.cs.allow-dyld-environment-variables`
  and `com.apple.security.cs.disable-library-validation`. Together they let
  `DYLD_INSERT_LIBRARIES` load an unsigned (ad-hoc signed) library, without re-signing or patching
  the game on disk.
- **Stripped:** only Steam and libjingle symbols remain, and the binary links Lua 5.2 statically with no
  names.
- **No process can write code pages** under the hardened runtime, and the kernel denies `task_for_pid`
  even to root, so neither inline hooks nor an external memory reader can work.

EEex, the established tool, is Windows-only. Its author dropped native macOS support in 2023 ("would
fight me every step of the way") and recommends Wine or CrossOver instead[^eeex-thread] (p44). A 2020
claim in the same thread that macOS binaries keep their symbols, so `dlsym` could replace pattern
scanning (p29), does not hold for the 2.7.3 binary.

## Decision

**Load a small, read-only native library into the 2.7.3 game process with `DYLD_INSERT_LIBRARIES`,
launched through the game's own executable.**

- The inspector supports only the 2.7.3 Steam build; older versions are out of scope.
- The launcher sets the variable through `/usr/bin/env` inside `script`'s argument list, because `script`
  is SIP-protected and dyld strips `DYLD_*` variables from protected processes. Verified in Phase 0:
  the library loads into the game this way, and dyld strips the same variable set on `script` itself
  ([delivery note](../notes/2026-11-01-injection.md)).
- The library hooks nothing by patching code. Its single hook is one imported function interposed by
  dyld at load time ([ADR-0005](0005-dyld-interposing-hook.md)).

## Options considered

- **DYLD_INSERT_LIBRARIES dylib** (chosen): permitted by the game's own entitlements, in-process, no
  changes to the game on disk.
- **Windows build under CrossOver with real EEex and BG2RadarOverlay**: works today, but needs a Windows
  copy of the game and leaves macOS-native play untouched. Kept as the fallback if Phase 0 fails.
- **External memory reader** (BG2RadarOverlay's model): not possible, because the kernel denies
  `task_for_pid` for hardened-runtime processes.
- **Lua and ui.menu only**: cannot reach enemy state (BG2EE-GameLog).
- **Patching or re-signing the game binary**: invasive, breaks on every update, and unnecessary given the
  entitlements.
- **Targeting 2.6 under Rosetta**: briefly considered while the machine had 2.6 installed; it adds
  Rosetta to the injection path with no native fallback, and the project dropped it once checks
  confirmed 2.7.3 fine.

## Consequences

- Players launch through the project's launcher (`deno task play`) until a launcher without Deno exists
  (TODO.md).
- A Steam update that removes either entitlement ends this approach; `deno task doctor` checks both on
  every run.
- Re-evaluate if Beamdog changes the entitlements, or if a macOS update starts stripping the variable
  from the game itself.

[^eeex-thread]: [MOD] EEex (v1.3.1), Bubb and contributors, Beamdog Forums,
    <https://forums.beamdog.com/discussion/71798/mod-eeex-v1-3-1>
