# Manual tests

Tests a person runs by hand, step by step, usually at the game. Each one says what it proves, how long
it takes, what to do and for how long, what to watch for, and how the result is judged. Its **Runs**
table records every execution, with links to the delivery notes that hold the evidence. They are
undated, because they are run again: after a fix, and after every game update. `lint:docs` fails on a
manual test that is not linked here or that drops a section of the template (`docs-review` skill,
`references/page-types.md`).

| Manual test | Proves | Duration |
| --- | --- | --- |
| [Hook gate](hook-gate.md) | the interposed `glClear` runs every frame on the main thread, with idle Lua to register on (ADR-0005) | about 15 minutes |
