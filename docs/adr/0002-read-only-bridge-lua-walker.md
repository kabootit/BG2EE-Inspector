---
type: ADR
id: "0002"
title: "A read-only native bridge, struct walking in Lua, data-first output"
description: "The dylib exposes only bounded memory reads, registered through one interposed import (ADR-0005), with a per-build address table; all struct walking is Lua with named fields; output is a data API plus message-window text, with any UI left to external mods."
status: proposed
date: 2026-11-01
---

# ADR-0002: A read-only native bridge, struct walking in Lua, data-first output

**Status:** Proposed (active once the Phase 3 gate passes) · **Date:** 2026-11-01

## References

- [ADR-0001](0001-native-dylib-injection.md): how the library gets into the process.
- [Architecture](../architecture.md): diagrams of these layers, the boot sequence and the inspect flow.
- EEex forum thread[^eeex-thread]: the design history and engine pitfalls cited below by page.
- BG2RadarOverlay[^radar] (MIT): a working read-only model on Windows.

## Context

- **Prior designs.** EEex began in 2018 as two or three native functions that read arbitrary memory, with
  the logic in Lua, because hand-written assembly was "a literal hell"[^eeex-thread] (p3). Both EEex
  (`function_names.db`) and BG2RadarOverlay locate engine data with per-version fixed addresses, not
  runtime pattern scans.
- **Offsets break across versions.** EEex later replaced raw offsets with named-field bindings for
  exactly this reason (p41).
- **macOS constraints.** The hardened runtime forbids writing code pages, so no hook can patch code.
  Phase 1 also found that the game registers its `Infinity_*` functions in code, with no `luaL_Reg`
  table to swap a pointer in; [ADR-0005](0005-dyld-interposing-hook.md) records the hook used instead.

## Decision

**A tiny read-only C bridge, keyed to the game build, feeding struct walking and formatting written in
Lua; output on request as a data API and message-window text.**

### Native bridge

- **Address table, not pattern scanning.** `native/builds.h` maps the build's `LC_UUID` (read from the
  in-memory Mach-O header) to image-relative offsets. The ASLR slide is added at load, and expected bytes
  are checked at every address. An unknown build or any mismatch disables the inspector.
- **One hook**, decided in [ADR-0005](0005-dyld-interposing-hook.md): dyld interposes `glClear`, and the
  replacement registers the native read functions once Lua is idle on the main thread, then only passes
  calls through. No `mprotect` anywhere, enforced by `lint:security`.
- **Reads only**, through `mach_vm_read_overwrite`, so a bad pointer returns `nil` instead of crashing.

### Lua walker

- **Named fields.** Walker code reads named paths; only `a7x_offsets_<build>.lua` maps names to numbers.
- **Global object array.** Creatures are enumerated from it, filtered by area and EA, as BG2RadarOverlay
  does.
- **Engine pitfalls from the EEex thread, guarded against:**
  - check each object's type before reading it as a sprite (p20);
  - skip walks during loads and area transitions, when pointers go stale (p19, p21, p25, p31);
  - choose `m_derivedStats` or `m_tempStats` by `m_bAllowEffectListCall`;
  - read HP as signed (p15);
  - use only the timed effect list for countdowns (p19 to p21);
  - convert durations at 15 ticks per second, validated before trusted (p19 to p21);
  - show the engine's expiry, never a computed duration (p11, p12, p17).
- **Bounded.** Every walk has a node cap and pointer-range checks, and refreshes are timed against a
  per-frame budget.

### Output

- **A versioned public data API.** `A7X.get`, `A7X.list`, `A7X.hovered`, `A7X.portrait`, `A7X.status` and
  `A7X.version` return fresh schema-1 tables.
- **Triggers.** The `e` key over a creature or portrait, `e` followed by a portrait click, and console
  commands, all printing through `Infinity_DisplayString`.
- **No automatic output**, and no UI panel in this project: external mods build on the API.

## Options considered

- **Read-only C bridge with a per-build address table, Lua walker with named fields, on-request text and
  data API** (chosen): the smallest native surface the hardened runtime allows, the per-version-address
  model both mature tools use, and the Lua-centric shape EEex started from, with EEex's later lesson
  about named fields applied.
- **Runtime pattern scanning in the dylib**: not taken; both mature tools use per-version addresses, and
  patterns are a tool for re-deriving them, not for every launch.
- **Generated typed bindings** (EEex's model): not taken; it needs code generation from headers that
  carry no license, and a far larger native surface.
- **Inline function hooks**: impossible under the hardened runtime.
- **A UI panel first**: deferred to an external mod, so the data layer proves itself in text first.
- **Shift-click on a creature**: not possible; world clicks are handled in C++, buttons have no modifier
  variant, and Lua cannot read keyboard state.
- **"e" then a click on a creature in the world**: not taken; the click would issue an attack order.
- **Auto-print on hover**: dropped; output happens only on an explicit request.
- **Exposing raw reads to other mods**: not taken; offsets change per build and raw reads can crash the
  game.

## Consequences

- Each game update needs `deno task derive` and the Phase 3 and 5 gates before the inspector works again;
  until then it disables itself.
- Lua-side walking may cost frame time; if a refresh exceeds the budget, the effect walk moves into C as a
  read-only function.
- Re-evaluate if Phase 1 cannot locate the Lua API with confidence, or if the hotkey cannot reach
  `ui.menu`.

[^eeex-thread]: [MOD] EEex (v1.3.1), Bubb and contributors, Beamdog Forums,
    <https://forums.beamdog.com/discussion/71798/mod-eeex-v1-3-1>

[^radar]: BG2RadarOverlay, tapahob, <https://github.com/tapahob/BG2RadarOverlay>
