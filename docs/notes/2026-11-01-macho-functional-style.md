---
title: "Mach-O header reader, functional style: Delivery Notes"
description: "machoArchs rewritten from an imperative loop into a declarative tagged union, a pure classifier and a bounded offset list; a declarative-versus-imperative comparison (readability, safety, testing, change, and the risk of premature optimization), costs and benefits, and the untrusted-count trap a direct translation would have walked into."
---

# Mach-O header reader, functional style: Delivery Notes

> Delivery record for a refactor of `src/re/macho.ts` during review of Step 1
> (`initial/02-requirements`). It is a code-style change with one deliberate behaviour change, so it has
> no ADR; the [Step 1 note](2026-11-01-requirements.md) covers where the reader is used.

## Status

**Done; tests pass, and doctor reads the real binaries the same as before.**

| Piece | State |
| --- | --- |
| `src/re/macho.ts` rewritten | Done |
| Tests for an untrusted entry count, truncated entries, and the two new pure functions | Done; written first and run against the original loop |
| Behaviour on the game, WeiDU and the doctor test build | Unchanged |

## Plan summary

`machoArchs` tells doctor whether a binary is arm64 or x86_64 without running it. The question raised in
review: the code was imperative (early returns, a mutable array, a `for` loop with `break`); what would a
functional version look like, and is it better?

Why it was worth changing now rather than leaving a working 16-line function:

- **Phase 1 grows this file** into the reader for segments, sections and strings that `deno task derive`
  builds on. A parse-then-interpret shape (classify the bytes into a typed value, then act on the value)
  scales to that; a single function of nested early returns does not.
- **Review exposed an implicit safety property** that deserved to be stated in the code (below).

## What was built

### Before

One function did everything. It returned early for short input, thin files and non-Mach-O files, and
otherwise looped over fat entries, pushing into an array:

```ts
export function machoArchs(bytes: Uint8Array): string[] {
  if (bytes.length < 8) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) === MH_MAGIC_64) return [name(view.getUint32(4, true))];
  const magic = view.getUint32(0, false);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) return [];
  const count = view.getUint32(4, false);
  const entrySize = magic === FAT_MAGIC ? 20 : 32;
  const archs: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + i * entrySize;
    if (at + 4 > bytes.length) break;
    archs.push(name(view.getUint32(at, false)));
  }
  return archs;
}
```

### After

Three pure pieces and a tagged union. `readHeader` classifies the file; `fatEntryOffsets` computes where
the entries are, bounded by the file size; `machoArchs` interprets the classification:

```ts
export type MachoHeader =
  | { kind: "thin"; cpu: number }
  | { kind: "fat"; count: number; entrySize: 20 | 32 }
  | { kind: "none" };

export function fatEntryOffsets(count: number, entrySize: number, byteLength: number): number[] {
  const fit = Math.max(0, Math.floor((byteLength - FAT_HEADER_SIZE) / entrySize));
  return Array.from({ length: Math.min(count, fit) }, (_, i) => FAT_HEADER_SIZE + i * entrySize);
}

export function machoArchs(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readHeader(view);
  switch (header.kind) {
    case "thin":
      return [name(header.cpu)];
    case "fat":
      return fatEntryOffsets(header.count, header.entrySize, view.byteLength)
        .map((at) => name(view.getUint32(at, false)));
    case "none":
      return [];
  }
}
```

(`readHeader` is the three early-return checks, now returning a `MachoHeader` instead of an answer.)

### Comparison

How the two versions differ on the points that matter for this file:

| | Before | After |
| --- | --- | --- |
| Size | 16-line function, 38-line file | 32 lines for the type and three functions, 68-line file |
| Shape | one function: classify and interpret interleaved | classify (`readHeader`), locate (`fatEntryOffsets`), interpret (`machoArchs`) |
| State | mutable array, loop counter, `break` | no mutation; a computed length and a `map` |
| File kinds | implicit in the order of the `if`s | explicit in `MachoHeader`; a new kind will not type-check until the `switch` handles it |
| Untrusted entry count | bounded only because the loop happened to `break` at the end of the bytes | bounded on purpose by `fatEntryOffsets`, with a comment saying why |
| A truncated last entry | counted if its first 4 bytes were present | not counted: only complete entries (see below) |
| Testable units | `machoArchs` only | `readHeader` and `fatEntryOffsets` on their own, plus `machoArchs` |

### Declarative versus imperative

The two versions answer the same question in different voices. The imperative loop says **how**:
start a counter, compute an offset, check it, push, repeat, stop. The declarative version says **what**:
a file is thin, fat or neither; the entries are the complete ones that fit; the architectures are those
entries' names. The comparison below shows what that difference buys and where the imperative style
still has the edge:

| | Imperative (before) | Declarative (after) |
| --- | --- | --- |
| **Reading it** | The meaning is assembled in the reader's head by simulating the loop: what `i` is, when `break` fires, what `archs` holds at each step. | Each line states a fact. "The offsets are the entries that fit, capped by the claim" can be read off `fatEntryOffsets` without running anything in your head. |
| **Naming the concepts** | "Thin", "fat" and "not Mach-O" exist only as the order of `if` statements. | They are named values in `MachoHeader`, so a reader, a reviewer and the compiler all see the same three cases. |
| **Safety** | Correctness depends on control flow being right everywhere: the `break` is what keeps an untrusted count from running away, and moving or deleting it would compile silently. | The bound is a value (`Math.min(count, fit)`) computed once, up front, and commented. There is no control flow left to get wrong, and the `switch` must handle every kind of file or it will not type-check. |
| **Mutation** | `archs` and `i` change as the loop runs, so a reader has to track state over time. | Nothing changes after it is created; every value can be understood the moment it appears. |
| **Testing** | Only the whole function can be tested, so every case needs a hand-built file, and the bound can only be observed indirectly. | `readHeader` and `fatEntryOffsets` are pure and take plain numbers or eight bytes, so each rule gets its own small test: `fatEntryOffsets(0xffffffff, 20, 48)` proves the cap directly. |
| **Changing it** | Adding a fourth file kind means finding the right place in a chain of early returns. | Adding a kind is adding a case to `MachoHeader`; the compiler points at every place that must handle it. |
| **Where imperative wins** | Shorter. Familiar to anyone. Stops at the first out-of-range entry without computing a length first. Allocates nothing extra. Does exactly what today's one caller needs. | Twice the lines. Builds an offset array before mapping (bounded by the file, so a handful of numbers here). Asks the reader to know `Array.from` with a length and a tagged union. **Can be premature optimization**: structure optimized for growth that has not happened yet, paid for now in size and indirection. |

For a 16-line function the imperative version was perfectly readable, which is why this is a judgment
call rather than a fix. Restructuring code for a future that may not arrive is a form of **premature
optimization**, optimizing for flexibility instead of speed, and the minimal-surface rule warns against
exactly that. It tips towards declarative here anyway because the growth is planned rather than imagined
(Phase 1 extends this file), because the input is untrusted, and because the one safety property that
mattered was hidden in control flow. Those are the conditions under which "what" ages better than "how";
without them, the loop would have been the right call.

**Costs:**

- **About twice the code**, for a function that worked.
- **Three exported names instead of one:** `readHeader` and `fatEntryOffsets` are exported so they can be
  tested and reused in Phase 1.
- **One small behaviour change**, deliberate.

**Benefits:**

- **The structure Phase 1 needs**, in place before the file grows.
- **Exhaustive file kinds,** checked by the compiler.
- **A safety property stated** instead of incidental.
- **Smaller pieces with their own tests.**

## Gotchas worth remembering

- **The untrusted-count trap.** The fat header's entry count comes from the file, and the file is
  untrusted: a corrupt or hostile header can claim up to 2^32-1 entries. A direct functional translation,
  `Array.from({ length: count }, ...)`, would build an offset list as long as the claim before reading a
  single entry. The loop was safe only because its `break` stopped at the end of the bytes, which nobody
  had written down. The rewrite caps the length at what the file can physically hold. This was reasoned
  from the code; the unbounded variant was not run, since doing so is the failure being avoided.
- **Behaviour change: only complete entries count.** The loop accepted a final entry whose first 4 bytes
  (the CPU type) were present even if the rest of its 20 or 32 bytes were missing. A partial entry means
  a corrupt file, so the rewrite counts only entries that fit completely. No real binary is affected: the
  game, WeiDU and the doctor test build read the same as before.
- **Tests first, against the old code.** The new tests for the oversized count and truncated entries
  were run against the original loop before the rewrite, so they pin down existing behaviour rather than
  describe the new code. The one test that differs, `fatEntryOffsets(3, 20, 47)`, covers the deliberate
  change above and targets a function that did not exist before.

## Verification

Run on 2026-11-01:

- **Before the rewrite:** `test/re/macho_test.ts` with the two new behaviour tests, against the original
  loop. 6 passed.
- **After the rewrite:** the same file plus tests for `readHeader` and `fatEntryOffsets`, 8 passed. The
  oversized-count case (a 48-byte file claiming 2^32-1 entries) returns its two real entries, inside the
  test's 100 ms limit.
- **Real binaries:** `deno task doctor` still reads the game as `x86_64 + arm64`, the doctor test build
  as `arm64`, and WeiDU as v251.00 arm64.
- **Everything:** `deno task lint` passes.

## Follow-ups

- **Phase 1** extends this file with segment, section and string readers in the same style: classify into
  a typed value, then interpret, with every count and offset from the file bounded by its size.
- **Possibly a rule.** If this style should apply across the project, write it into `docs/rules/` (for
  example "prefer pure functions over a typed value; bound every count read from untrusted input") rather
  than leave it to review.
