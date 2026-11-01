# BG2EE-Inspector

An in-game inspector for Baldur's Gate II: Enhanced Edition 2.7.3 on macOS (Apple Silicon). A small
read-only native library is loaded into the game with `DYLD_INSERT_LIBRARIES`; Lua in the game's own UI
walks engine memory and prints creature stats and active spells, with time left, on request. See
[docs/architecture.md](docs/architecture.md) and the plan in
[docs/plans/2026-11-01-inspector-foundation.md](docs/plans/2026-11-01-inspector-foundation.md).

## Always

- **Security first:** default-deny, scoped Deno flags, the native library stays read-only.
  [docs/rules/security-first.md](docs/rules/security-first.md)
- **Install nothing without asking.** Every requirement is listed in
  [docs/requirements.md](docs/requirements.md) and checked by `deno task doctor`.
  Deno **2.9.8** or later is required and checked by every task (`MIN_DENO` in
  `src/shared/deno_version.ts`).
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
| `deno task doctor` | check every requirement in docs/requirements.md; reads the game, never runs it or WeiDU |
| `deno task setup-weidu` | download WeiDU v251 arm64 into `vendor/weidu/`, checked against GitHub's digest |
| `deno task setup-dev` | download the Lua 5.2.4 source into `vendor/` (contributors only) |
| `deno task build` | build `build/a7x.dylib` (arm64, ad-hoc signed) from `native/` |
| `deno task play` | launch the game with the library, log redacted output to `logs/`; `--no-inject` for a control run. Only when asked |
| `deno task lint` | fmt check, lint, type-check, tests, `lint:docs`, `lint:security`. Run before every commit |
| `deno task lint:docs` | the mechanical docs rules |
| `deno task lint:security` | the mechanical security invariants |
| `deno task test` | the test suite in `test/` |
| `deno task check` | type-check |

## Layout

```text
native/          the read-only dylib (C); the per-build address table arrives in Phase 1
mod/inspector/   the WeiDU component and in-game Lua (from Phase 3)
src/             Deno, grouped by concern; no loose files (test/structure_test.ts)
  tasks/         one entry point per deno task: `await runTask(main)`; the only code that exits
  shared/        deno_version.ts, task.ts (the runner), repo_files.ts, config.ts, sha256.ts
  lint/          docs.ts, security.ts
  setup/         doctor.ts, install.ts, download.ts, system.ts (the machine, injectable for tests)
  re/            macho.ts (Mach-O architectures for now)
  build/         dylib.ts (build and check the library, shared by build and doctor)
  game/          capture.ts, launch.ts, session.ts (the play launcher)
                 later: gamefiles/, model/, verify/ (see docs/architecture.md)
test/            mirrors src/ (test/lint/docs_test.ts tests src/lint/docs.ts); test/lua, test/e2e later
docs/            rules, ADRs, plans, delivery notes, specs; start at docs/README.md
.claude/         committed settings (deny and ask lists) and skills
```
