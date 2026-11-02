# Manual tests

Tests a person runs by hand, step by step, usually at the game. Each one says what it proves, how long
it takes, what to do and for how long, what to watch for, and how the result is judged. Its **Runs**
table records every execution, with links to the delivery notes that hold the evidence. They are
undated, because they are run again: after a fix, and after every game update. `lint:docs` fails on a
manual test that is not linked here or that drops a section of the template (`docs-review` skill,
`references/page-types.md`).

## How a run goes

Every manual test is run the same way, from a committed, clean tree:

1. **Run it.** Follow the page from Before you start to the end of Steps. Only the tester launches the
   game.
2. **Stop early if something is wrong.** What to watch for lists what counts. Report what was seen and
   at which step; a failed run is still a result.
3. **Report.** Say "done" (or what went wrong) when the run is over.
4. **Judge.** The output named in Pass criteria (usually the newest `logs/session-<stamp>.log`) is read
   against its table.
5. **Draft the record.** A new row in the page's Runs table, and the delivery note for the phase the
   run belongs to, with the evidence. Neither is committed yet.
6. **Review, then commit.** The tester reviews both, and they are committed only on request. A failed
   run is recorded the same way, followed by the fix, a new commit and a new run, each its own row.

## Index

The manual tests so far:

| Manual test | Proves | Duration |
| --- | --- | --- |
| [Hook gate](hook-gate.md) | the interposed `glClear` runs every frame on the main thread, with idle Lua to register on (ADR-0005) | about 15 minutes |
