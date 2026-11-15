---
title: "Searching declaratively: a generator for the candidates, iterator helpers for the rest"
description: "A byte search in the Mach-O reader rewritten from a cursor loop into a small generator plus filter, map and toArray. The three shapes considered, why the rewrite chose the generator, the out-of-bounds read the rewrite removed (and the test that would have failed before it), and where the pattern stops paying."
---

# Searching declaratively: a generator for the candidates, iterator helpers for the rest

A learning piece from `src/re/macho.ts`, written when `deno task re game-clock` needed the address of
a string in the game binary and the search moved out of `xrefs` into a function of its own. The
lesson is general: a "find every occurrence" loop does two jobs, producing candidates and deciding
which ones match, and splitting them makes each one state what it does.

## The job

`cstringAddresses(slice, text)` returns every address in the binary's `__TEXT,__cstring` section where
`text` sits, followed by its NUL. A string can sit at the start of an entry or in the tail of a longer
one, because the linker merges `"Ticks"` into `"GetTicks"` when one ends the other. `xrefs` then looks
for code that loads each address, and `game-clock` follows the first one to `Infinity_GetGameTicks`.

## Before

The search, as it stood inline in `xrefs`:

```ts
const target = new TextEncoder().encode(`${args[0]}\0`);
const cs = section(slice, "__TEXT", "__cstring")!;
const hits: number[] = [];
for (let at = cs.offset; at < cs.offset + cs.size;) {
  const i = slice.indexOf(target[0], at);
  if (i < 0 || i >= cs.offset + cs.size) break;
  // Not only at string starts: the linker merges a string into the tail of a longer one.
  if (target.every((b, k) => slice[i + k] === b)) hits.push(cs.addr + i - cs.offset);
  at = i + 1;
}
```

It works, and `indexOf` makes it fast: native code skips to the next byte that could start a match.
But the reader has to run it in their head to see what it finds. Three things change on every pass
(the cursor `at`, the candidate `i`, the `hits` array), the loop's own condition is not what ends it
(the `break` is), and the loop checks the section's bounds in two places with two different
expressions.

## Three shapes considered

1. **Filter over every offset** in the section: `Array.from` the indices, `filter` the ones where
   the bytes match, `map` them to addresses. The most direct statement of the definition, but it
   builds an array of every index (about 280,000 for this section) and gives up the native skip.
2. **A generator for the candidates**, iterator helpers for the rest: the native skip stays, inside
   a function whose only job is to yield where a byte occurs.
3. **Recursion**, `find(at) = hit ? [hit, ...find(next)] : []`. JavaScript does not eliminate tail
   calls, so a string with many hits could overflow the stack, and it reads no better than the loop.

The rewrite chose the second, the most declarative of the three that are safe.

## After

```ts
/** Each index of `byte` in `bytes`, in order, found lazily with the native `indexOf`. */
export function* indicesOf(bytes: Uint8Array, byte: number): Generator<number> {
  for (let i = bytes.indexOf(byte); i >= 0; i = bytes.indexOf(byte, i + 1)) yield i;
}

/**
 * Every address in __TEXT,__cstring where `text` and its terminating NUL sit. Not only at string
 * starts: the linker merges a string into the tail of a longer one. Matched within the section, so a
 * string cut off at its end is not found.
 */
export function cstringAddresses(slice: Uint8Array, text: string): number[] {
  const cs = section(slice, "__TEXT", "__cstring");
  if (!cs) return [];
  const target = new TextEncoder().encode(`${text}\0`);
  const strings = slice.subarray(cs.offset, cs.offset + cs.size);
  return indicesOf(strings, target[0])
    .filter((i) => target.every((b, k) => strings[i + k] === b))
    .map((i) => cs.addr + i)
    .toArray();
}
```

`filter`, `map` and `toArray` here are iterator helpers, methods on the generator itself, not on an
array (ES2025, in Deno's V8). Each candidate passes through `filter` and `map` as the generator
yields it, so the chain builds no array of candidates.

## Why this is better

- **Each part states one thing.** `indicesOf` says where a byte occurs; the chain says which of those
  places hold the whole string, and at what address. The loop is still there, but it is three lines
  that do nothing except find the next index, and it has a test of its own.
- **The bounds appear once.** The search runs on `strings`, a view of exactly the section, so
  every index is section-relative and the address is `cs.addr + i`, with no offset arithmetic left.
- **It removed a bug the loop had.** The loop checked that a match *started* inside the section, but
  `slice[i + k]` read on past its end. A view has no bytes past its end (`strings[i + k]` is
  `undefined`, which matches nothing), so the search no longer finds a string whose NUL lies just
  beyond the section. A test now covers it, `a string cut off at the end of __cstring is not found`, and the
  old loop, run on the same fixture, reported a match there: the test would have failed before.
- **Nothing else changed:** `deno task re xrefs Infinity_GetGameTicks` and `deno task re game-clock`
  print what they printed before, and the existing tests pass untouched.

## Where the pattern stops paying

- **The loop does not disappear; it moves.** Producing a sequence from a native search is a loop in
  JavaScript, whatever wraps it. The gain is that the loop is tiny and generic; a generator that grew
  conditions about what counts as a match would be the old loop again under another name.
- **Laziness only matters for large or unbounded input, or an early exit.** For a few hundred bytes
  an array is as good, and option 1 would read just as well. This rewrite chose the generator for its
  shape, not for a speed no one ever measured.
- **Iterator helpers are recent.** They need an engine from 2024 on; the Deno version this project
  requires has them, and the type checker knows them. Code meant for older engines would need
  `Array.from(indicesOf(...))` first, which gives up the laziness.
- **Recursion is not the functional answer in JavaScript.** Without tail-call elimination it is a
  stack overflow waiting for a large input; a generator is the idiomatic lazy sequence.
