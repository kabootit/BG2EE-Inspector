# Tests

**Tests live in the top-level `test/` folder, never beside source, and use real data where real data
exists. Tests never ship.**

**Why:** source folders hold only source, so a test is never told apart by its name alone, and a check
eyeballed once in a one-off command is lost the moment it scrolls away.

## How to apply

- **Where:** `test/` mirrors the source it covers (`test/lint_docs_test.ts` tests `src/lint_docs.ts`).
  Lua unit tests go in `test/lua/`; end-to-end fixtures in `test/e2e/`. `lint:security` flags any
  `*_test.ts` or `*_test.lua` outside `test/`.
- **Probes for checks.** Every lint rule has a test showing it fail, built from strings assembled at run
  time so the test file does not trip the linter itself.
- **Real data.** Cases come from captured sessions and the game's own files where possible.
- **Never shipped.** The WeiDU component copies only `mod/inspector/`; `test/` is never installed into the
  game.
- **Run** `deno task test`, or `deno task lint` for everything.

Related: [toolchain.md](toolchain.md), [verify-derived-values.md](verify-derived-values.md).
