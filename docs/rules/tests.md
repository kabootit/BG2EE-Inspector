# Tests

**Tests live in the top-level `test/` folder, never beside source, and use real data where real data
exists. Tests never ship.**

**Why:** source folders hold only source, so a test is never told apart by its name alone, and a check
eyeballed once in a one-off command is lost the moment it scrolls away.

## How to apply

- **Where:** `test/` mirrors the source it covers (`test/lint/docs_test.ts` tests `src/lint/docs.ts`).
  Lua tests go in `test/lua/` (run with stock Lua 5.2.4 built from `vendor/`), C tests of
  `native/` in `test/native/`, end-to-end fixtures in `test/e2e/`. `lint:security` flags any
  `*_test.ts` or `*_test.lua` outside `test/`.
- **Probes for checks.** Every lint rule has a test showing it fail, built from strings assembled at run
  time so the test file does not trip the linter itself.
- **Real data.** Cases come from captured sessions and the game's own files where possible.
- **Never shipped.** The WeiDU component copies only `mod/inspector/`; `test/` is never installed into the
  game. The one exception is a script a manual test copies into `override/` by hand for its session and
  removes at its end, both as steps of that test (`test/lua/a7xt.lua`, for the
  [bridge test](../manual-tests/bridge.md)).
- **Run** `deno task test`, `deno task test:native` and `deno task test:lua`, or `deno task lint` for
  everything. The last two compile with the Command Line Tools into `build/`, and `test:lua` needs
  the Lua source from `deno task setup-dev`.

Related: [toolchain.md](toolchain.md), [verify-derived-values.md](verify-derived-values.md).
