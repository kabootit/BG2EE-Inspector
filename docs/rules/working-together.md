# Working together

**Make the change, say what to test in-game, and wait. Never launch, quit or restart the game unless
asked.**

**Why:** a tester exercises new behavior by hand first, and the game is a live process with saves and
settings in it. The game rewrites `Baldur.lua` from memory on exit, so an unexpected quit or restart can
silently undo a settings change (BG2EE-GameLog, gotcha 8c).

## How to apply

- **Manual testing first.** After a change, give the exact in-game steps to check it, then stop. Write a
  test longer than a few steps as a manual test in `docs/manual-tests/` (see [docs.md](docs.md)) and
  link it, with its duration, instead of typing it into the conversation: the tester runs it again after
  every fix and game update, and its Runs table keeps the record. Commands that open the game window
  (`deno task play`, `deno task e2e`) run only when asked, and the reply to the request says the window
  will open.
- **Test tool behavior before designing on it.** When a design depends on how a tool or the engine
  behaves (what a console method does, whether a key reaches `ui.menu`, how an archive is laid out), test
  it first and record the result in the plan or `docs/re-notes.md`. Docs alone are not enough: the
  Tranquil project built a whole layout on an assumption a five-minute test would have disproved.
- **Pace.** No testing loops: stop after two failed fixes, or about 20 minutes on one problem, and report
  the fixes tried.
- **Plans start in plan mode** and take shape there before any code changes. Save an approved plan in
  `docs/plans/` (see [docs.md](docs.md)).
- **Work visibly.** The chat shows the tester a summary of each tool call, so the way the work happens
  decides what the tester can see ([the learning note](../learnings/2026-11-14-visible-work.md)):
  - file changes go through the Edit tool, so each appears as a diff; use a script only for an edit
    too large or repetitive for it, and name it with its path when it runs;
  - analysis whose results the docs cite becomes tested project tooling, as `deno task re` did, so a
    finding can be re-checked after a game update;
  - any other one-off script stays in the scratchpad, named with its full path and its purpose when it
    runs.
- **Edit in place before a push.** Rewrite anything not yet pushed (ADRs, docs, notes, plans) in place
  when a decision changes, with no amendment notes or dated changelog. A dropped approach appears,
  at most, in an ADR's "Options considered".

Related: [git.md](git.md), [docs.md](docs.md), [verify-derived-values.md](verify-derived-values.md).
