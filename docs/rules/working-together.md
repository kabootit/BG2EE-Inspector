# Working together

**Make the change, say what to test in-game, and wait. Never launch, quit or restart the game unless
asked.**

**Why:** new behavior is exercised by hand first, and the game is a live process with saves and settings
in it. `Baldur.lua` is rewritten from memory on exit, so an unexpected quit or restart can silently undo a
settings change (BG2EE-GameLog, gotcha 8c).

## How to apply

- **Manual testing first.** After a change, give the exact in-game steps to check it, then stop. A test
  longer than a few steps is written as a manual test in `docs/manual-tests/` (see [docs.md](docs.md)) and
  linked, with its duration, instead of being typed into the conversation: it is run again after every
  fix and game update, and its Runs table keeps the record. Commands that open the game window
  (`deno task play`, `deno task e2e`) run only when asked, and the request is answered by saying the
  window will open.
- **Test tool behavior before designing on it.** When a design depends on how a tool or the engine
  behaves (what a console method does, whether a key reaches `ui.menu`, how an archive is laid out), test
  it first and record the result in the plan or `docs/re-notes.md`. Docs alone are not enough: the
  Tranquil project built a whole layout on an assumption a five-minute test would have disproved.
- **Pace.** No testing loops: stop after two failed fixes, or about 20 minutes on one problem, and report
  what was tried.
- **Plans start in plan mode** and are iterated there before any code changes. An approved plan is saved
  in `docs/plans/` (see [docs.md](docs.md)).
- **Edit in place before a push.** Anything not yet pushed (ADRs, docs, notes, plans) is rewritten in
  place when a decision changes, with no amendment notes or dated changelog. A dropped approach appears,
  at most, in an ADR's "Options considered".

Related: [git.md](git.md), [docs.md](docs.md), [verify-derived-values.md](verify-derived-values.md).
