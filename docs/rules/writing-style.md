# Writing style

**No em dashes. Impersonal, with no personal names. Active voice. Say it plainly and specifically.
Cite outside sources with footnotes.**

**Why:** documents read as project artifacts, not correspondence, and every borrowed claim stays
traceable. These apply to docs, ADRs, delivery notes, plans, commit messages, UI strings and in-game
output text.

## How to apply

- **No em dashes.** A parenthetical pair becomes commas or parentheses; a trailing elaboration becomes a
  colon or a new sentence; two joined clauses become a comma or two sentences. `lint:docs` checks this.
- **Impersonal.** No names, no "he" or "she", no "the user asked". Write "Decisions made (date)" and
  "commit only when explicitly requested". No home-directory paths or email addresses in the repo;
  `/Users/<name>` is the placeholder. `lint:docs` and `lint:security` check this.
- **Active voice.** Name who or what acts: "the walker reads the list", not "the list is read". A
  command is impersonal too: "Run `deno task verify`". `lint:docs` flags a form of "to be" before a
  past participle ("is written", "are not read") outside code, inline code and double-quoted text.
  An adjective with no verb behind it ("untested", "unchanged") is not passive and passes.
- **Plain and specific.** Name the actual thing ("`I.get` and `I.list`", not "the getters"). Qualify a
  term that could mean two things ("game ticks", not "ticks", where real time is also in play). Spell out
  vague conditions.
- **Footnotes for outside sources.** A `[^slug]` marker at the point of use and a
  `[^slug]: Title, author or org, <url>` definition near the end, for each distinct source, always,
  not only on request. The docs cite the EEex forum thread, for example, as `[^eeex-thread]` with page numbers.

Related: [docs.md](docs.md).
