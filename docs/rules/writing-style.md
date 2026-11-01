# Writing style

**No em dashes. Impersonal, with no personal names. Say it plainly and specifically. Cite outside
sources with footnotes.**

**Why:** documents read as project artifacts, not correspondence, and every borrowed claim stays
traceable. These apply to docs, ADRs, delivery notes, plans, commit messages, UI strings and in-game
output text.

## How to apply

- **No em dashes.** A parenthetical pair becomes commas or parentheses; a trailing elaboration becomes a
  colon or a new sentence; two joined clauses become a comma or two sentences. `lint:docs` checks this.
- **Impersonal.** No names, no "he" or "she", no "the user asked". Write "Decisions made (date)" and
  "commit only when explicitly requested". No home-directory paths or email addresses in the repo;
  `/Users/<name>` is the placeholder. `lint:docs` and `lint:security` check this.
- **Plain and specific.** Name the actual thing ("`A7X.get` and `A7X.list`", not "the getters"). Qualify a
  term that could mean two things ("game ticks", not "ticks", where real time is also in play). Spell out
  vague conditions.
- **Footnotes for outside sources.** A `[^slug]` marker at the point of use and a
  `[^slug]: Title, author or org, <url>` definition near the end, for each distinct source, without being
  asked. The EEex forum thread, for example, is cited as `[^eeex-thread]` with page numbers.

Related: [docs.md](docs.md).
