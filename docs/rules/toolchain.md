# Toolchain

**Deno for all orchestration, C only in `native/`, Lua only in `mod/`. Install nothing without asking;
`docs/requirements.md` lists every requirement. The project requires Deno 2.9.8 or later.**

**Why:** the project is open source, so a contributor must be able to set it up from one document, and a
tool that appears mid-project is a requirement nobody wrote down. Every shell detour in BG2EE-GameLog cost
something real: an apostrophe in `Baldur's Gate` breaking quoting, a zsh glob silently skipping a step.

## How to apply

- **Deno for tasks, scripts and tests.** Entry points go through `deno task`. Calling a system binary from
  `Deno.Command` is fine (`script`, `clang`, `ditto`, `codesign`); the orchestration stays in TypeScript.
- **Never Python, perl, npm, npx or shell scripts**, including for throwaway work.
- **Imports:** relative files, `node:assert/strict` for tests, `jsr:@std/*` with a pinned major
  version, and `jsr:@zod/zod@4`, the schema library for the inspector's records
  ([ADR-0006](../adr/0006-data-model-and-api.md)). Nothing else. `lint:security` checks every
  import, and `deno.lock`, committed and frozen, pins each remote module's hash.
- **Deno version.** `MIN_DENO` in `src/shared/deno_version.ts` is 2.9.8, and every task runs through
  `runTask()` (`src/shared/task.ts`), which checks it first, so an older Deno fails with one clear line.
  Raise it there and in `docs/requirements.md` together.
- **Source layout.** `src/` groups its code by concern with no loose files, and only `src/tasks/`
  (plus the runner) exits the process; see [docs/architecture.md](../architecture.md#code-organization).
  `test/structure_test.ts` enforces it.
- **Install nothing without asking**, one install at a time, naming the package, its source and why the
  existing tools are not enough. Add anything found missing to `docs/requirements.md` and to
  `deno task doctor`.
- **Check what the machine actually has** before relying on it: resolve tools with `xcrun -f`, and never
  trust `/usr/bin/clang`, which is a stub that exists even with nothing installed.

Related: [security-first.md](security-first.md), [tests.md](tests.md).
