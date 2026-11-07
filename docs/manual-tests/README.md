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

## When a test changes

A manual test page always describes how to run it against the current code, because it is run again
after fixes and game updates. When a change alters what a test does or checks:

- **The same commit updates the page**: its steps or its Pass criteria, keeping the earlier values in
  the text where they still help a reader.
- **It adds a row to the page's Changes to this test table**, under Runs: the date, the commit, what
  changed, and what earlier runs were judged against. The table starts with the first change after
  the first run.
- **Runs rows are never edited.** Each one keeps its meaning through its delivery note, which quotes
  what that run logged, and through git, which keeps every version of the page.

## Index

The manual tests so far:

| Manual test | Proves | Duration |
| --- | --- | --- |
| [Hook gate](hook-gate.md) | the interposed `glClear` runs every frame on the main thread, with idle Lua to register on (ADR-0005) | about 15 minutes |
| [Bridge](bridge.md) | the library registers `A7X_native` and its read functions answer from the game's Lua (Phase 2) | about 10 minutes |
