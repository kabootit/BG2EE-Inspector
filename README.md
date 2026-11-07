# BG2EE-Inspector

## What

An in-game inspector for Baldur's Gate II: Enhanced Edition on macOS. Press a hotkey over a creature or
portrait, or type a console command, and it prints that creature's stats (HP, AC, THAC0, saves,
resistances, MR) and active spells, with the time left until each wears off.

**Status: under construction.** The project conventions are in place; the inspector itself is built in
the phases of the [foundation plan](docs/plans/2026-11-01-inspector-foundation.md).

## Why

The game shows little of this, and the existing tools (EEex and BG2RadarOverlay) are Windows-only; EEex
dropped native macOS support in 2023. It is possible on macOS now because BG2:EE 2.7 is a native Apple
Silicon (arm64) build, so the game no longer runs under Rosetta the way earlier x86_64-only versions did,
and a small native library can load straight into the game process. That works because the game ships
with two code-signing entitlements, `allow-dyld-environment-variables` and
`disable-library-validation`, that permit loading an extra library.

## Installation

Steps 1 to 4 and 6 work today, though the library so far only registers its read functions into the
game's Lua and shows nothing in the game; step 5 arrives in a later phase.

1. Install the [requirements](docs/requirements.md), including **Deno 2.9.8** or later.
2. `deno task setup-weidu`: fetch the pinned WeiDU release.
3. `deno task doctor`: check every requirement.
4. `deno task build`: build the read-only library.
5. `deno task install-mod`: install the WeiDU component (`--uninstall` removes it).
6. `deno task play`: launch the game with the library loaded.

Only the BG2:EE 2.7.3 Steam build is supported, because engine addresses are binary-specific.
Compatibility with other mods has not been tested yet; see [TODO.md](TODO.md).

Documentation starts at [docs/README.md](docs/README.md).

## Attributions and prior art

- [EEex](https://github.com/Bubb13/EEex) and [EEex-Docs](https://github.com/Bubb13/EEex-Docs): the
  `Infinity_*` Lua API reference, and the Lua-centric, per-version-address design this project follows on
  macOS (reference only; no code used).
- [EEex forum thread on Beamdog Forums](https://forums.beamdog.com/discussion/71798/mod-eeex-v1-3-1):
  EEex's history and design reasoning, the macOS discussion, and the engine pitfalls (object types, stale
  pointers after loads, timed versus equipped effect lists, 15 ticks per second) the walker guards
  against.
- [InfinityLoader](https://github.com/Bubb13/InfinityLoader): `EEex-v2.7.3.0` struct and field names,
  used as a layout guide (reference only; no code or headers used).
- [BG2RadarOverlay](https://github.com/tapahob/BG2RadarOverlay) (MIT): prior art for showing enemy stats
  and buff durations from memory reads; its object-array scan and `CGameEffect` field list were
  cross-references.
- [Near Infinity](https://github.com/Argent77/NearInfinity) and
  [IESDP](https://gibberlings3.github.io/iesdp/): file formats and `.cre` and `.spl` fields for checking
  values.
- [WeiDU](https://github.com/WeiDUorg/weidu): the mod installer.
- [Lua 5.2.4](https://www.lua.org/): the reference build for identifying engine functions; downloaded by
  `setup-dev`, never redistributed.
- [BG2EE-GameLog](https://github.com/kabootit/BG2EE-GameLog): findings this project builds on rather
  than rediscovering, and tooling it adapts.
  - **Findings:** no creature state is reachable from the game's Lua, settled from the full binding
    registry (the reason for a native library); the 146 `Infinity_*` functions, `e` as
    `g_pBaldurChitin`, and the restricted Lua standard library; `Infinity_Log` reaching stdout, captured
    line by line through `script`; engine calls being unsafe while `ui.menu` loads; `Baldur.lua` being
    rewritten on exit.
  - **Tooling:** the launch and capture, WeiDU patching, game-file reading, the security lint and audit,
    and the rule to verify derived values.
- Project conventions are adapted from the [Tranquil projects'](https://github.com/tranquillabs)
  development rules.
