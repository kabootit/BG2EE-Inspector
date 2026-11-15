# Declarative style

**Write Deno code as a description of its result, not as the steps that build it: `filter` and `map`
instead of a loop that pushes into an array, a table instead of the same statement repeated, and a
small generator where the code can only find values one at a time.**

**Why:** a loop that keeps a cursor, a result array and a `break` makes the reader run it to learn
what it finds, and every piece of state is a place for an edge case to hide. Each declarative rewrite
in this repository has shown it:

- `machoArchs` became a tagged union and a bounded offset list, and the rewrite exposed an untrusted
  entry count a direct translation would have trusted
  ([Mach-O reader, functional style](../notes/2026-11-01-macho-functional-style.md)).
- The spawn check's parsers became tables of fields and handlers, so one place spells out the
  line format ([the format as data](../learnings/2026-11-14-declarative-line-parsing.md)).
- `cstringAddresses` became a generator plus iterator helpers, which removed a read past the end of
  the section the loop had ([searching declaratively](../learnings/2026-11-15-generators-for-searching.md)).

## How to apply

- **Transform, do not accumulate.** Reach for `map`, `filter`, `flatMap`, `find`, `some`, `every`,
  `Array.from({ length }, …)` and `Map.groupBy` before a `for` loop that pushes into an array or
  fills a map.
- **A sequence the code must produce step by step** (a native search such as `indexOf`, a linked
  structure, a stream) is a small generator whose only job is to yield, and the rest is iterator
  helpers on it: `.filter(…).map(…).toArray()`. Keep the generator generic; one that grows conditions
  about what counts as a match is the old loop under another name. `indicesOf` in `src/re/macho.ts`
  is the model.
- **Repeated statements with different parameters are data:** a table of rows and one generic step,
  as `FIELDS` in `src/verify/spawn.ts`, one row per compared field. A case that needs its own logic
  stays code beside the table, with a comment saying why.
- **Parse, then interpret:** classify bytes or lines into a typed value first, then act on the value.
- **No recursion for a sequence of unknown length.** JavaScript does not eliminate tail calls, so it
  overflows the stack on a large input; a generator is the lazy sequence.
- **A loop stays when it is clearer:** an early exit that depends on state built along the way, or a
  hot path where a measurement shows the difference. Say why in a comment.
- **New and changed code.** Do not rewrite working code for style alone; a function takes this
  shape when it next changes for another reason.
- **Judgment, not lint:** `deno lint` has no rule for this, so code review checks it. Lua follows
  the surrounding code: it has no iterator helpers, and the in-game walker's bounded loops state
  their caps.

Related: [return-types.md](return-types.md), [minimal-surface.md](minimal-surface.md).
