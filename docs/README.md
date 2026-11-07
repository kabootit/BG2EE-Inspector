# Documentation

Everything written about this project lives here. Start with the architecture, then the plan; the rules
apply to all work in the repo.

## Overview

- [Requirements](requirements.md): what to install first, and how `deno task doctor` checks it.
- [Architecture](architecture.md): diagrams of the roadmap, code organization, runtime layers, boot
  sequence, inspect workflow and game-update workflow.
- [Reverse-engineering notes](re-notes.md): every engine address the native library uses, how it was
  found and checked, and how to find it again after a game update.
- [Foundation plan](plans/2026-11-01-inspector-foundation.md): the approved plan for the first release,
  with its research and decisions.

## Terms

Words this project uses in its own sense, alphabetically. Pages use them without explaining them each
time; this is where they are explained.

| Term | Meaning |
| --- | --- |
| anchor | A short piece of the game's code whose instructions encode the address of a global the library reads. Hashing the anchor checks the global's offset, which cannot be hashed itself because it is data (`native/builds.h`) |
| bridge | The native library's read-only interface to the game's Lua: the `A7X_native` table of read functions it registers (Phase 2, ADR-0002, ADR-0005) |
| gate | A pass/fail check that must pass before the next phase may build on a result. The roadmap's diamonds are gates; each is run as a [manual test](manual-tests/README.md), and its result goes in that test's Runs table and a delivery note. Examples: the hook gate (does the hook run on the main thread with Lua idle?) and the party check (do the walker's values equal the engine's for every party member?) |
| hook | The one place the library gets to run code inside the game after start-up: its replacement for the game's `glClear` (ADR-0005) |
| marker branch | A branch named `initial/NN-<summary>`, pushed when a step or phase of the foundation plan is done, so each stage can be checked out later |
| probe | The first, report-only version of the hook, which logged what it saw and changed nothing; the hook gate ran it |
| site | A range of the game's code the library depends on, recorded in `native/builds.h` with its offset, size and hash, and checked at load and by `deno task test` |
| slice | One architecture's part of a universal binary; the game ships x86_64 and arm64 slices, and only the arm64 one is supported |
| stats block | One of a creature's two copies of its computed stats, `m_derivedStats` and `m_tempStats`; the engine says which one is current |
| walker | The Lua code that follows engine structures from `A7X_native.Root()` to each creature and reads its fields by name (Phase 3) |

## Decisions

- [ADR index](adr/README.md): every architecture decision record, in order.

## Rules

How work is done on this project. [CLAUDE.md](../CLAUDE.md) summarizes them.

| Rule | Covers |
| --- | --- |
| [working-together.md](rules/working-together.md) | testing by hand first, pace, editing in place before a push |
| [git.md](rules/git.md) | git only when asked, no AI attribution, one branch |
| [writing-style.md](rules/writing-style.md) | no em dashes, impersonal, plain, footnotes |
| [security-first.md](rules/security-first.md) | default-deny, the read-only native library, licensing |
| [toolchain.md](rules/toolchain.md) | Deno, C and Lua only; install nothing without asking; Deno 2.9.8+ |
| [minimal-surface.md](rules/minimal-surface.md) | the smallest surface that does the job |
| [verify-derived-values.md](rules/verify-derived-values.md) | validation gates before stating values as fact |
| [tests.md](rules/tests.md) | tests in `test/`, probes for every check |
| [docs.md](rules/docs.md) | page types, ADRs, plans, delivery notes, diagrams |

## Manual tests

Manual tests run at the game, step by step, each with its record of runs:
[manual tests index](manual-tests/README.md).

## Plans and delivery notes

- Plans, named `YYYY-MM-DD-<topic>.md`: [2026-11-01 foundation](plans/2026-11-01-inspector-foundation.md),
  [2026-11-06 Phase 2, the bridge](plans/2026-11-06-bridge.md),
  [2026-11-06 Phase 3, the party walker](plans/2026-11-06-party-walker.md).
- Delivery notes, named `YYYY-MM-DD-<topic>.md` so they sort by time:
  [2026-11-01 Step 0, setup](notes/2026-11-01-setup.md),
  [2026-11-01 Step 1, requirements](notes/2026-11-01-requirements.md),
  [2026-11-01 Mach-O reader, functional style](notes/2026-11-01-macho-functional-style.md),
  [2026-11-01 Phase 0, injection](notes/2026-11-01-injection.md),
  [2026-11-01 game session shutdown and memory](notes/2026-11-01-session-shutdown.md),
  [2026-11-01 node:assert versus the Deno standard library](notes/2026-11-01-node-assert-and-std.md),
  [2026-11-01 the interposing hook and its probe](notes/2026-11-01-interposing-hook.md),
  [2026-11-06 the hook gate](notes/2026-11-06-hook-gate.md),
  [2026-11-06 Phase 2, the bridge](notes/2026-11-06-bridge.md).
