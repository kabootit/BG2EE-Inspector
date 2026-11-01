# Docs, ADRs, plans and delivery notes

**All documentation is markdown in `docs/`, reachable from [docs/README.md](../README.md). Every docs
change runs `deno task lint:docs` first and then the `docs-review` skill.**

**Why:** each unit of work documents itself in one place, in step with the code, and the linter decides
everything decidable so review time goes to what it cannot catch (a stale example, a table that omits
half its subject, a verification section that implies more was exercised than was).

## How to apply

- **Page types** and their templates are in the `docs-review` skill's `references/page-types.md`: guide,
  ADR, plan, delivery note, rule.
- **Fix only findings on the pages being changed.**
- **Diagrams** are Mermaid fences: rendered and looked at before committing (VS Code preview or GitHub),
  vertical layouts, quoted labels, no braces in labels.
- **Reference docs change with their source**, in the same change (`docs/data-model.md` with
  `src/model.ts`, `docs/api.md` with `a7x_api.lua`).

## ADRs

- **Location:** `docs/adr/NNNN-slug.md`, numbered monotonically from 0001, each linked from
  [docs/adr/README.md](../adr/README.md). Start from `0000-template.md`.
- **Format:** frontmatter `type: ADR`, `id`, `title`, `description`, `status`
  (`proposed`, `active`, `superseded`, `retired`), `date`, and `superseded_by` when superseded. Then the H1
  `# ADR-NNNN: Title`, a status line, and sections References, Context, Decision, Options considered,
  Consequences.
- **Editing:** before a push, rewrite in place and keep no history. After a push, fold in follow-on work
  that completes the same decision; supersede only for a real reversal.

## Plans

Work starts in plan mode. An approved plan is saved as `docs/plans/YYYY-MM-DD-topic.md` with the H1
`# Plan: …`, and edited in place until pushed. It holds Context with "Decisions made (date)",
Deliverables, the design, Verification, and an order of work that ends with asking before any commit or
remote change.

## Delivery notes

After each discrete effort (each step or phase), write `docs/notes/YYYY-MM-DD-<topic>.md` (dated like
plans, so the folder sorts by time; `lint:docs` checks the name) with frontmatter
`title` and `description`: a lede linking the ADR and the plan, Status (a piece-by-piece table), Plan
summary, What was built, Gotchas worth remembering, Verification (what was run, with counts, and a
numbered "still to check by hand" list), and Follow-ups. It never claims more verification than happened.

Related: [writing-style.md](writing-style.md), [working-together.md](working-together.md).
