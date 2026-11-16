# Manual tests

Tests a person runs by hand, step by step, usually at the game. Each one says what it proves, how long
it takes, what to do and for how long, what to watch for, and how to judge the result. Its **Runs**
table records every execution, with links to the delivery notes that hold the evidence. The pages are
undated, because the tester runs them again: after a fix, and after every game update. `lint:docs`
fails on a manual test that this page does not link or that drops a section of the template
(`docs-review` skill, `references/page-types.md`).

## How a run goes

Every manual test runs the same way, on the local working tree as it is, committed or not. A passed
run is the go-ahead for the next step, not an artifact to trace back later, so the Runs row records
what happened (the latest commit, and "local changes" when there were any) without claiming that git
can check the tested state out again:

1. **Run it.** Follow the page from Before you start to the end of Steps. Only the tester launches the
   game.
2. **Stop early if something is wrong.** What to watch for lists what counts. Report what happened and
   at which step; a failed run is still a result.
3. **Report.** Say "done" (or what went wrong) when the run is over.
4. **Judge.** Read the output named in Pass criteria (usually the newest `logs/session-<stamp>.log`)
   against its table.
5. **Draft the record.** A new row in the page's Runs table, and the delivery note for the phase the
   run belongs to, with the evidence. Commit neither yet.
6. **Review, then commit.** The tester reviews both; commit them only on request. Record a failed run
   the same way, followed by the fix and a new run, each its own row; the fix need not reach a commit
   before the new run.

**The check scripts and the API do not share a session.** The party check, creature list and spawn
check scripts read memory through the global `Inspector_native`; the inspector's API takes that table
private on its first call ([ADR-0006](../adr/0006-data-model-and-api.md)). Run a check in a session in
which nothing has called `I` yet: no `I` command typed and, with the WeiDU component installed, the
`e` key not pressed, since it calls `I.show()`. Loading alone does not take the table, so the
component's loading `inspector` at startup is fine. A session for the [Data API](api.md) test runs no check
script.

**With the WeiDU component installed, the game has already loaded `I`** when a save loads. Typing
`Infinity_DoFile("insp")`, as the [Data API](api.md) and [Under the pointer](pointer.md) tests do, is
then harmless: a second load changes nothing. Those tests copy the six files into `override/` by hand,
which on a game with the component overwrites the same files with the repo's versions.

## When a test changes

A manual test page always describes how to run it against the current code, because the tester runs
it again after fixes and game updates. When a change alters what a test does or checks:

- **The same commit updates the page**: its steps or its Pass criteria, keeping the earlier values in
  the text where they still help a reader.
- **It adds a row to the page's Changes to this test table**, under Runs: the date, the commit, what
  changed, and the criteria that judged earlier runs. The table starts with the first change after
  the first run.
- **Nobody edits a Runs row.** Each one keeps its meaning through its delivery note, which quotes
  what that run logged, and through git, which keeps every version of the page.

## Index

The manual tests so far:

| Manual test | Proves | Duration |
| --- | --- | --- |
| [Hook gate](hook-gate.md) | the interposed `glClear` runs every frame on the main thread, with idle Lua to register on (ADR-0005) | about 15 minutes |
| [Bridge](bridge.md) | the library registers `Inspector_native` and its read functions answer from the game's Lua (Phase 2) | about 10 minutes |
| [Party check](walker.md) | the walker reads every party member's stats as the engine shows them (Phase 3) | about 10 minutes |
| [Creature list](creatures.md) | the walker lists the creatures in the area on screen, the party among them, with their EA groups (Phase 3) | about 15 minutes |
| [Spawn check](spawn.md) | the walker reads creatures outside the party as their `.cre` files give them (Phase 3) | about 15 minutes |
| [Data API](api.md) | the public `I` API and console output give schema-1 records that match the record screen (Phase 4) | about 15 minutes |
| [Under the pointer](pointer.md) | `I.show()` shows the creature or the party portrait under the pointer, from `CGameArea +0x244` and `mouseOverPortrait` (Phase 4) | about 10 minutes |
| [Hotkey and install](hotkey.md) | `deno task install-mod` installs the WeiDU component, `e` prints the creature or portrait under the pointer with no console, and the uninstall restores `override/` (Phase 4) | about 20 minutes |
| [Effect presence](effects.md) | each party member's two effect lists read to their end, every effect's fields where the effect file layout puts them, beside the record screen's status icons (Phase 5) | about 15 minutes |
| [Effect duration](durations.md) | the game's clock stands still while paused, each effect's expiry is its spell file's duration at 15 game ticks a second, and a spell's icon goes when its effect expires (Phase 5) | about 15 minutes |
| [Release install](release.md) | a fresh copy of the source, with nothing gitignored, installs, plays and uninstalls by `docs/install.md` alone (v0.1.0) | about 25 minutes |
| [Spell countdown](countdown.md) | `e` shows each active spell by name with its time left, counting down until its icon goes, for party members and other creatures, and every record's `effects` matches the game files (Phase 5) | about 20 minutes |
