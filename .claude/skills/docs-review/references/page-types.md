# Page types

The six shapes used in this repo, and the template for each. Identify the type before applying Pass 1's
type-mismatch check.

## Guide

Task-oriented, for someone at the keyboard or in the game (for example `docs/testing.md`).

- H1, then one or two sentences on what the reader can do here.
- `##` sections named for tasks, not subsystems.
- Every table has a lead-in sentence.

## ADR (`docs/adr/NNNN-slug.md`)

Start from `docs/adr/0000-template.md` and add the ADR to `docs/adr/README.md`.

- Frontmatter: `type: ADR`, `id`, `title`, `description`, `status` (`proposed`, `active`, `superseded`,
  `retired`), `date`, and `superseded_by` when superseded.
- H1 `# ADR-NNNN: <title>`, matching the frontmatter title exactly, then
  `**Status:** … · **Date:** …`.
- Sections in order: References (at the top), Context, Decision (bold one or two sentences, then `###`
  detail), Options considered (`**Option** (chosen)`, then the ones not taken and why), Consequences
  (including what would trigger re-evaluation).
- Outside sources as footnotes, defined at the bottom.
- Before a push, rewrite in place; after a push, fold in follow-on work and supersede only for a real
  reversal.

## Plan (`docs/plans/YYYY-MM-DD-topic.md`)

Written in plan mode, saved on approval.

- H1 `# Plan: <title>`, then a status line.
- Context with "Decisions made (date)", Deliverables (ADR, delivery note, code), the design,
  Verification, and an order of work ending with asking before any commit or remote change.

## Delivery note (`docs/notes/YYYY-MM-DD-<topic>.md`)

Written after each step or phase; it says what was built and where, while the ADR says why. The date
prefix makes the folder sort by time, like `docs/plans/`; use the date the note is written, and a short
topic (for the foundation plan, the summary part of the `initial/NN-<summary>` branch, e.g.
`2026-11-01-setup.md` for `initial/01-setup`).

- Frontmatter `title` and `description`.
- H1, then a `>` lede linking the ADR and the plan.
- `## Status` with a bold state and a `| Piece | State |` table.
- `## Plan summary`, `## What was built` (file tables), `## Gotchas worth remembering`.
- `## Verification`: what was run, with counts, then a numbered "Still to check by hand" list that
  links a manual test rather than repeating its steps.
- `## Follow-ups`. No closer.

## Manual test (`docs/manual-tests/<slug>.md`)

A manual test run by a person at the game, written once and run again. Undated; linked from
`docs/manual-tests/README.md`.

- Frontmatter `type: manual-test`, `title`, `description`, `duration` (the whole run, and the part in the
  game).
- H1 `# Manual test: <title>`, then a paragraph: what the run shows, why it matters, and a link to the ADR
  or plan section it serves.
- `## Before you start`: the state needed (game closed, commit, save, settings) and the time.
- `## Steps`: numbered, each with how long it takes and what it exercises; commands in `sh` fences.
- `## What to watch for`: what makes the tester stop, and what to report.
- `## Pass criteria`: where the evidence is (a log, a command's output) and a table of what must appear.
- `## Runs`: one row per execution, with the date, the commit, the result and the delivery note. The
  manual test is not edited to describe a run; the note does that. Once a run exists, every later change
  to the steps or pass criteria adds a row to `### Changes to this test` under it: date, commit, what
  changed, and what earlier runs were judged against (`docs/manual-tests/README.md`).
- A delivery note's "Still to check by hand" links the manual test instead of repeating its steps.

## Rule (`docs/rules/<topic>.md`)

- `# Title`, the rule in bold, `**Why:**` with the real incident or reason, `## How to apply` bullets,
  then `Related:` links.
- Linked from `docs/README.md` and summarized in `CLAUDE.md`.
