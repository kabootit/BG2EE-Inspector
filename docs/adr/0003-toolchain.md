---
type: ADR
id: "0003"
title: "C with the Command Line Tools, Deno orchestration, Lua 5.2.4 as reference"
description: "The dylib is C built with Apple's Command Line Tools; all tasks are Deno 2.9.8+; reverse engineering uses llvm-objdump plus Deno helpers; Lua 5.2.4 source is a contributor-only download; nothing else is required."
status: active
date: 2026-11-01
---

# ADR-0003: C with the Command Line Tools, Deno orchestration, Lua 5.2.4 as reference

**Status:** Active · **Date:** 2026-11-01

## References

- [toolchain.md](../rules/toolchain.md): the rule this decision feeds.
- [Foundation plan](../plans/2026-11-01-inspector-foundation.md), Step 1: the requirements document and
  `doctor` check.

## Context

The project is open source, so every tool is a requirement someone else must install. Facts checked on
the development machine (2026-11-01):

- **Command Line Tools alone are enough.** With `DEVELOPER_DIR=/Library/Developer/CommandLineTools`
  (Xcode excluded), `xcrun -f` resolves `clang`, `ld`, `llvm-objdump`, `otool` and `codesign_allocate`
  from the CLT 16.2 package, its own macOS 15.2 SDK supplies `mach/mach_vm.h`, and a test dylib using
  the planned APIs compiled and linked for arm64. `/usr/bin/codesign` ships with macOS itself.
- **A clean machine is untested** (TODO.md).
- **The game embeds Lua 5.2** with no patch level recorded.
- **Deno 2.9.8** is installed and is the version the project is developed on.

## Decision

**C for the native library, built with the Xcode Command Line Tools (or full Xcode); Deno 2.9.8 or later
for every task; no other tools.**

- **Deno version:** `MIN_DENO` in `src/deno_version.ts`, checked by every task entry point.
- **Reverse engineering:** `xcrun llvm-objdump` plus a Deno Mach-O helper (`src/macho.ts`).
- **Contributor-only download:** Lua 5.2.4 source, fetched by `deno task setup-dev` into gitignored
  `vendor/` with a pinned SHA-256. It is the reference for recognizing stripped Lua functions and builds
  the interpreter for `deno task test:lua`.
- **WeiDU** v251.00 native arm64, fetched by `deno task setup-weidu` with a pinned SHA-256, instead of
  borrowing whatever `setup-*` binary a mod left in the game folder.

## Options considered

- **C with the CLT** (chosen): already present, smallest output, matches the engine's C++ layouts.
- **Rust**: safer, but adds rustup and FFI glue for C layouts.
- **Ghidra**: not taken; needs Java, which is not wanted on the machine.
- **radare2 via Homebrew**: not needed; `llvm-objdump` and the Deno helper cover the work.
- **Python helper scripts**: excluded by the toolchain rule.
- **Borrowing a mod's `setup-*` WeiDU**: dropped; version unknown, often x86_64 only, matched by filename.

## Consequences

- Players need the Command Line Tools until prebuilt releases exist (TODO.md).
- Raising the Deno minimum means updating `src/deno_version.ts` and `docs/requirements.md` together.
- Re-evaluate if the Lua reference proves insufficient to identify the engine's Lua API.
