# Page types

The five shapes used in this repo, and the template for each. Identify the type before applying Pass 1's
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
topic (for this plan, the `initial/<summary>` branch name, e.g. `2026-11-01-setup.md`).

- Frontmatter `title` and `description`.
- H1, then a `>` lede linking the ADR and the plan.
- `## Status` with a bold state and a `| Piece | State |` table.
- `## Plan summary`, `## What was built` (file tables), `## Gotchas worth remembering`.
- `## Verification`: what was run, with counts, then a numbered "Still to check by hand" list.
- `## Follow-ups`. No closer.

## Rule (`docs/rules/<topic>.md`)

- `# Title`, the rule in bold, `**Why:**` with the real incident or reason, `## How to apply` bullets,
  then `Related:` links.
- Linked from `docs/README.md` and summarized in `CLAUDE.md`.
