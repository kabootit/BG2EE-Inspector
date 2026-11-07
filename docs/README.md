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

- Plans: [2026-11-01 foundation](plans/2026-11-01-inspector-foundation.md).
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
