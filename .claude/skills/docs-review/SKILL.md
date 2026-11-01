---
name: docs-review
description: Write and review this repo's markdown documentation, any file under docs/ plus README.md, TODO.md and CLAUDE.md. Use when adding or editing a doc, ADR, plan, delivery note or rule, before committing a docs change, and when a page is reported as confusing, out of order, or carrying an example that does not work. Covers the linter, five review passes, severity scale and page templates.
---

# Docs review

Documentation here is plain markdown in `docs/`, rendered by GitHub and by VS Code's preview. A page must
be reachable from `docs/README.md` and follow [docs/rules/docs.md](../../../docs/rules/docs.md) and
[docs/rules/writing-style.md](../../../docs/rules/writing-style.md). Adapted from the Tranquil projects'
docs skill.

## Before anything else: run the linter

```sh
deno task lint:docs
```

It decides everything decidable: ADR format and registration, plan and note naming, reachability, dead
links and anchors, fence languages, em dashes, personal information. Don't spend judgment on what it
checks, and fix only findings on the pages being changed.

## Modes

Pick the mode from the request:

| Mode | When | Produce |
| --- | --- | --- |
| review | an existing page in hand | linter output, the five passes, a findings list |
| author | a new page, ADR, plan or note | the page in its type's template ([page types](references/page-types.md)), no report |
| lint | "check the docs", before a commit | linter output only, adjudicated |

## The five passes

Apply in order; each targets a different failure.

### Pass 1: purpose and orientation

- **Does the opening say what a reader can do with the page?** Orientation links come after that
  sentence, not instead of it.
- **Unnamed assumed context:** vocabulary such as "the walker", "the bridge" or "the gate" used with
  nothing establishing it. One clause usually fixes it.
- **Type mismatch:** an ADR with no decision, a delivery note with no "what was built", a rule with no
  "why".

### Pass 2: sequencing (the strongest pass)

- **A convention used before it is defined**, such as a task, flag or file format in an example that a
  later section explains. Chase this first.
- **Mechanism before use:** a section that answers in one sentence and then spends paragraphs on
  internals. Demote the internals.
- **Two sections that are one,** split by a boundary the page never explains.
- **Unannounced ordering:** say what a list is ordered by, if not importance.

### Pass 3: scanability

- **Every table gets a lead-in sentence** saying what it covers and when to reach for it. A heading is
  not a lead-in.
- **Prose that is really a list** becomes bullets.
- **Headings `h2` and `h3` only.**

### Pass 4: examples and self-consistency

- **Does every example obey the page's own rules?** Read the rules, then audit each example against them.
- **Would each example run as written?** Task names exist in `deno.json`, paths exist, APIs match
  `docs/api.md`.
- **Do examples agree with tables on the same page?**
- **Diagrams** have been rendered and looked at; vertical layouts, quoted labels, no braces.

### Pass 5: links and claims

- Adjudicate linter findings; a broken anchor is never acceptable.
- **Renaming a heading breaks inbound anchors:** search for the slug across the repo first.
- **A verification section must not imply more was exercised than was**, and a value must not be stated
  as fact before it is validated ([verify-derived-values.md](../../../docs/rules/verify-derived-values.md)).

## Severity

Three levels, used for what they say:

- **broken:** wrong, unrunnable, or misleading; a reader following it fails.
- **friction:** correct, but costs the reader more than it should.
- **polish:** worth doing; nobody is harmed if it ships.

## Out of scope

- Visual styling: GitHub and the preview decide it.
- Renaming or date-stamping existing files, which breaks links (plans are dated at creation by design).
- Hand-written tables of contents.
- Demanding "conclusion first" on a reference page organized for lookup.
- Adding a navigational closer to an ADR, note or plan.
