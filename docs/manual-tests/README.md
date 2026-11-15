# Manual tests

Tests a person runs by hand, step by step, usually at the game. Each one says what it proves, how long
it takes, what to do and for how long, what to watch for, and how the result is judged. Its **Runs**
table records every execution, with links to the delivery notes that hold the evidence. They are
undated, because they are run again: after a fix, and after every game update. `lint:docs` fails on a
manual test that is not linked here or that drops a section of the template (`docs-review` skill,
`references/page-types.md`).

## How a run goes

Every manual test is run the same way, on the local working tree as it is, committed or not. A
passed run is the go-ahead for the next step, not an artifact to trace back later, so the Runs row
records what happened (the latest commit, and "local changes" when there were any) without claiming
the tested state can be checked out again:

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
   run is recorded the same way, followed by the fix and a new run, each its own row; the fix need not
   be committed before the new run.

**The check scripts and the API do not share a session.** The party check, creature list and spawn
check scripts read memory through the global `A7X_native`; the inspector's API takes that table
private on its first call ([ADR-0006](../adr/0006-data-model-and-api.md)). Run a check in a session in
which nothing has called `A7X` yet: no `A7X` command typed and, with the WeiDU component installed, the
`e` key not pressed, since it calls `A7X.show()`. Loading alone does not take the table, so the
component's loading `a7x` at startup is fine. A session for the [Data API](api.md) test runs no check
script.

**With the WeiDU component installed, `A7X` is already loaded** when a save loads. Typing
`Infinity_DoFile("a7x")`, as the [Data API](api.md) and [Under the pointer](pointer.md) tests do, is
then harmless: a second load changes nothing. Those tests copy the six files into `override/` by hand,
which on a game with the component overwrites the same files with the repo's versions.

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
| [Party check](walker.md) | the walker reads every party member's stats as the engine shows them (Phase 3) | about 10 minutes |
| [Creature list](creatures.md) | the walker lists the creatures in the area on screen, the party among them, with their EA groups (Phase 3) | about 15 minutes |
| [Spawn check](spawn.md) | the walker reads creatures outside the party as their `.cre` files give them (Phase 3) | about 15 minutes |
| [Data API](api.md) | the public `A7X` API and console output give schema-1 records that match the record screen (Phase 4) | about 15 minutes |
| [Under the pointer](pointer.md) | `A7X.show()` shows the creature or the party portrait under the pointer, from `CGameArea +0x244` and `mouseOverPortrait` (Phase 4) | about 10 minutes |
| [Hotkey and install](hotkey.md) | `deno task install-mod` installs the WeiDU component, `e` prints the creature or portrait under the pointer with no console, and the uninstall restores `override/` (Phase 4) | about 20 minutes |
