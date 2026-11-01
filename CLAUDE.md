# BG2EE-Inspector

An in-game inspector for Baldur's Gate II: Enhanced Edition 2.7.3 on macOS (Apple Silicon). A small
read-only native library is loaded into the game with `DYLD_INSERT_LIBRARIES`; Lua in the game's own UI
walks engine memory and prints creature stats and active spells, with time left, on request. See
[docs/architecture.md](docs/architecture.md) and the plan in
[docs/plans/2026-11-01-inspector-foundation.md](docs/plans/2026-11-01-inspector-foundation.md).

## Always

- **Security first:** default-deny, scoped Deno flags, the native library stays read-only.
  [docs/rules/security-first.md](docs/rules/security-first.md)
- **Install nothing without asking.** Every requirement is listed in `docs/requirements.md` (Step 1).
  Deno **2.9.8** or later is required and checked by every task (`src/deno_version.ts`).
  [docs/rules/toolchain.md](docs/rules/toolchain.md)
- **Git only when asked:** `git add`, `commit` and `push` only on an explicit request; show the message
  first; **no AI attribution anywhere.** [docs/rules/git.md](docs/rules/git.md)
- **Make the change, say what to test in-game, and wait.** Never launch, quit or restart the game unless
  asked. [docs/rules/working-together.md](docs/rules/working-together.md)
- **Verify before stating:** a derived value is checked against an observable before it is reported as
  fact. [docs/rules/verify-derived-values.md](docs/rules/verify-derived-values.md)
- **No em dashes, impersonal, plain and specific.** [docs/rules/writing-style.md](docs/rules/writing-style.md)
- **Smallest surface that does the job.** [docs/rules/minimal-surface.md](docs/rules/minimal-surface.md)

## Read before

The rules by subject, and when each one applies:

| File | Read before |
| --- | --- |
| [docs/rules/docs.md](docs/rules/docs.md) | writing or editing any doc, ADR, plan or delivery note |
| [docs/rules/tests.md](docs/rules/tests.md) | adding or moving a test |
| [docs/rules/toolchain.md](docs/rules/toolchain.md) | adding a tool, task, import or language |
| [docs/rules/security-first.md](docs/rules/security-first.md) | touching `native/`, `deno.json` permissions, the launcher, or anything that executes a binary |

## Skills

- `docs-review` ([.claude/skills/docs-review/SKILL.md](.claude/skills/docs-review/SKILL.md)): run on
  every docs change.
- `security-audit` ([.claude/skills/security-audit/SKILL.md](.claude/skills/security-audit/SKILL.md)):
  run before installing anything into the game and before publishing.

## Tasks

The tasks available so far; more arrive with each step of the plan:

| task | what it does |
| --- | --- |
| `deno task lint` | fmt check, lint, type-check, tests, `lint:docs`, `lint:security`. Run before every commit |
| `deno task lint:docs` | the mechanical docs rules |
| `deno task lint:security` | the mechanical security invariants |
| `deno task test` | the test suite in `test/` |
| `deno task check` | type-check |

## Layout

```text
native/          the read-only dylib (C) and per-build address table (from Phase 0)
mod/inspector/   the WeiDU component and in-game Lua (from Phase 3)
src/             Deno tasks: linters now; doctor, build, install, play, verify later
test/            Deno tests; test/lua and test/e2e later
docs/            rules, ADRs, plans, delivery notes, specs; start at docs/README.md
.claude/         committed settings (deny and ask lists) and skills
```
