# Documentation

Everything written about this project lives here. Start with the architecture, then the plan; the rules
apply to all work in the repo.

## Overview

- [Architecture](architecture.md): diagrams of the roadmap, code organization, runtime layers, boot
  sequence, inspect workflow and game-update workflow.
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

## Plans and delivery notes

- Plans: [2026-11-01 foundation](plans/2026-11-01-inspector-foundation.md).
- Delivery notes, named `YYYY-MM-DD-<topic>.md` so they sort by time:
  [2026-11-01 Step 0, setup](notes/2026-11-01-setup.md).
