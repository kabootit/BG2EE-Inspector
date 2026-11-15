---
type: ADR
id: "0004"
title: "One docs folder, enforced rules, MIT"
description: "Conventions adapted from the Tranquil projects and BG2EE-GameLog live in one in-repo docs folder; lint:docs, lint:security and a committed Claude Code deny list enforce them; the project is MIT with issues and pull requests disabled."
status: active
date: 2026-11-01
---

# ADR-0004: One docs folder, enforced rules, MIT

**Status:** Active · **Date:** 2026-11-01

## References

- [docs/README.md](../README.md): the index of every rule and document.
- [Step 0 delivery note](../notes/2026-11-01-setup.md): what Step 0 built.

## Context

The project will grow over time and go public. Two existing sets of conventions were available:

- **The Tranquil projects:**
  - rules, a docs skill, ADR and delivery-note templates;
  - kept in a separate rules repo symlinked into each project;
  - ADRs and notes published on a separate website.
- **BG2EE-GameLog:** a Deno-only toolchain, a security lint, a security-audit procedure, and the
  derived-value rule.

An open-source repo has to be self-contained: outside readers cannot reach a sibling rules repo.

## Decision

**All conventions live in this repo: rules in `docs/rules/`, ADRs in `docs/adr/`, plans in `docs/plans/`,
delivery notes in `docs/notes/`, manual tests in `docs/manual-tests/`, skills in `.claude/skills/`. Linters and a
committed Claude Code settings file enforce the mechanical rules. The license is MIT.**

- **Taken from Tranquil:**
  - the rule-file shape (rule, why, how to apply);
  - working-together, git, writing-style, minimal-surface and tests rules;
  - the ADR template and editing policy, the delivery-note template;
  - the docs skill's five passes and severity scale.
- **Taken from BG2EE-GameLog:** the toolchain rule, the security lint (`src/lint.ts`), the security-audit
  procedure, the derived-value rule.
- **Enforcement:**
  - `deno task lint` runs fmt, lint, type-check, tests, `lint:docs` and `lint:security`;
  - `.claude/settings.json` denies package managers, Python and curl/wget, and asks before
    `git add`, `git commit`, `git push`, remote changes and `gh repo create`;
  - the deny list is advisory, since it matches command prefixes.
- **Git:** commits only when asked, no AI attribution, one branch. The repo has issues and pull requests
  disabled, so there is no contributing guide. It starts private and becomes public when ready.
- **Plans live in the project,** unlike Tranquil's out-of-repo plans folder, so the reasoning travels
  with the code.
- **Manual tests are pages of their own** (added at the hook gate, the first test too long for a chat message):
  undated pages in `docs/manual-tests/`, each with a Runs table, because the tester runs the same test
  again after fixes and game updates. Delivery notes link them instead of repeating the steps.

## Options considered

- **One in-repo `docs/` folder** (chosen): self-contained for anyone who clones it.
- **A shared InfinityEngine rules repo symlinked in** (Tranquil's model): not taken; contributors would
  need two repos, and symlinks out of the repo break for outside readers.
- **Written rules only, no deny list** (Tranquil's model): not taken; a backstop for installs, and a
  confirmation prompt for push, is cheap.
- **Denying push outright**: tried first, then moved to the ask list, because a denied push also blocks an
  explicitly requested push.
- **GPL-3.0**: not taken; MIT matches the Tranquil projects and is common for game tooling.

## Consequences

- The project leaves Tranquil-specific material (Electron, the website registry, sibling-repo symlinks)
  behind.
- Each new rule becomes a file in `docs/rules/`, linked from `docs/README.md` and `CLAUDE.md`.
- Re-evaluate the deny list if it blocks a legitimate, approved operation; adjust the list rather than
  bypass it.
