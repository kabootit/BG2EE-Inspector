---
title: "node:assert versus the Deno standard library: Delivery Notes"
description: "Why the tests import node:assert/strict rather than jsr:@std/assert: node: modules are built into the deno executable as its Node compatibility layer, while the standard library is a set of versioned JSR packages fetched on first use. Checked three ways (an empty cache with downloads blocked, the executable's contents, Deno's documentation), including a contradicting AI search summary."
---

# node:assert versus the Deno standard library: Delivery Notes

> Delivery record for a question raised during review of Phase 0 (`initial/03-injection`). It changes no
> code; it checks the reasoning behind a Step 0 choice recorded in the
> [Step 0 note](2026-11-01-setup.md) and [toolchain.md](../rules/toolchain.md).

## Status

**Answered and verified; no code changed.** The Step 0 choice stands on checked facts and is kept: the
tests stay on `node:assert/strict`.

| Question | Answer |
| --- | --- |
| Why `node:assert/strict` instead of Deno's own testing approach? | The tests do use Deno's approach (`Deno.test`, `deno test`); only the assertion functions come from `node:assert/strict`, because Deno has no built-in assertion module and `@std/assert` is a download |
| Is `node:assert/strict` really inside the deno executable? | Yes, verified three ways |
| Then is the standard library inside it too? | No; it is fetched from jsr.io on first use |
| Why the difference? | Deno's docs give no reason; the reading below is an inference |
| Switch to `@std/assert`? | No; decided 2026-11-01 to keep `node:assert/strict` |

## Plan summary

The question started with one line in a test file:

```ts
import { deepStrictEqual, strictEqual } from "node:assert/strict";
```

and asked why a Deno project uses a Node module instead of Deno's default testing approach. The answer
depended on a claim made from memory, that `node:assert` ships inside the Deno binary. That claim was then
challenged twice: directly, and with an AI search summary that stated the opposite. This note records how
each claim was checked, so the answer rests on evidence rather than on which source sounded surer.

The questions, in the order they were raised:

1. Why `node:assert/strict` instead of Deno's default testing approach?
2. Is it certain that `node:assert` ships inside the Deno binary?
3. A search with another AI says it does not; which is right?
4. If Node's modules are in the binary, is the Deno standard library in it too, and if not, why is it
   brought in externally?

## Findings

### 1. The tests already use Deno's testing approach

Every test is a `Deno.test(...)` run by `deno test`. The only Node piece is the assertion functions. Deno
has no assertion module built in; its standard one is `@std/assert`, a package on JSR.

The choice was made in Step 0 and recorded in the Step 0 note: "Tests use the built-in
`node:assert/strict` instead of `jsr:@std/assert`, so nothing had to be fetched and there is no lock file
yet." `toolchain.md` allows exactly that import for tests, and `lint:security` enforces the list. The
reason was the rule to install nothing without asking: a fresh clone runs `deno task test` offline.

### 2. `node:assert/strict` is built into the deno executable

The first answer stated this without having tested it. It was then checked three independent ways, on
Deno 2.9.8:

- **With downloads blocked.** A script importing `node:assert/strict` ran from a brand-new, empty Deno
  cache with remote and npm loading switched off (`--no-remote --no-npm --cached-only`). Afterwards the
  cache held only Deno's own analysis files and the compiled script, with no `remote/` or `npm/` folder,
  which is where downloads go. As a control, the same flags refused `jsr:@std/assert`: "A remote specifier
  was requested: `https://jsr.io/@std/assert/meta.json`, but --no-remote is specified."
- **In the executable itself.** The installed `deno` executable (78 MB) contains the module and its
  implementation files, under `ext:deno_node`, the name of Deno's Node compatibility layer:

  ```text
  ext:deno_node/assert.ts
  ext:deno_node/internal/assert.mjs
  ext:deno_node/internal/assert/assertion_error.js
  ext:deno_node/internal/assert/myers_diff.js
  ext:deno_node/internal/assert/utils.ts
  ```

- **In Deno's documentation** ([Node and npm compatibility](https://docs.deno.com/runtime/fundamentals/node/)):
  "Deno provides Node's built-in APIs through a compatibility layer. Import them with the `node:` prefix."
  It reports over 75% of Node's own test suite passing, "covering nearly every `node:` module", and
  mentions no install step for built-ins, contrasting them with npm packages, which Deno "downloads on
  first run".

### 3. The contradicting AI summary was wrong

An AI search summary consulted during review answered "No, `node:assert/strict` is not part of the Deno
binary", saying Deno "does not support Node.js modules directly". That describes very early Deno, not
Deno 2.x. Its own footer read "Auto-generated based on listed sources. May contain inaccuracies", and its
sources were the front pages of nodejs.org and docs.deno.com rather than a page on the question. All
three checks above contradict it. The lesson is the one in
[verify-derived-values.md](../rules/verify-derived-values.md): when two sources disagree, run the check
rather than weigh the sources.

### 4. The standard library is not in the executable

- **With downloads blocked**, `jsr:@std/assert` fails, as above.
- **In the executable**, the string `jsr:@std/assert@1` does appear, but inside the `deno init` project
  template, next to the starter `export function add(a: number, b: number)`. It is the text of the starter
  test file, which imports the library from jsr.io. No `ext:` module for the standard library exists, unlike
  the `ext:deno_node` files behind `node:assert`.
- **Deno's documentation** ([Standard library](https://docs.deno.com/runtime/fundamentals/standard_library/)):
  "The library is published as a set of modular packages on JSR under the @std scope. You install only
  the packages you need, and each one is versioned independently."

### 5. Why one is built in and the other is not

Deno's documentation states neither reason. The reading below is an inference from the design, not a
documented fact:

| | `node:` modules | `@std/*` |
| --- | --- | --- |
| What it is | Part of the runtime: Deno's re-implementation of Node's built-in API | An ordinary library, written on top of the runtime |
| Why it sits where it does | npm packages import `node:fs`, `node:assert` and others without declaring them, because Node always has them. Deno must have them built in for npm packages to work, as Node does | Nothing outside a project depends on it implicitly, so it can be a normal versioned dependency |
| Versioning | Tied to the Deno version | Each package versioned separately: a project pins `@std/assert@1` and upgrades it independently of Deno |
| Cost of building it in | Already required for compatibility | Every Deno install would carry every package and every version |

So what is built in is what code must be able to rely on without asking: Deno's own APIs (`Deno.test`,
`Deno.Command`), the web platform APIs (`fetch`, `crypto.subtle`, `TextDecoderStream`) and Node
compatibility. Everything else is a library a project chooses and pins.

A historical detail fits this picture but was not checked: Node compatibility reportedly began inside
the standard library and moved into the runtime once npm support made it essential.

### Trade-off for this project

What switching the tests to `@std/assert` would change:

| | `node:assert/strict` (now) | `jsr:@std/assert@1` |
| --- | --- | --- |
| Download | none; inside Deno | from jsr.io on first run, then cached |
| Lock file | none | `deno.lock` committed, to pin the exact contents |
| Idiomatic Deno | less: Node's API | yes: what Deno's docs and most Deno projects use |
| Functions used here | `deepStrictEqual`, `strictEqual`, `rejects`, `throws` | `assertEquals`, `assertStrictEquals`, `assertRejects`, `assertThrows`, plus extras not needed here |
| Supply chain | nothing outside the Deno executable | one pinned third-party package |

## Gotchas worth remembering

- **A claim from memory is not a finding.** "Ships inside the Deno binary" was right, but it was first
  stated without a test. The empty-cache run is what made it a fact.
- **A string in a binary is not a module in it.** `jsr:@std/assert@1` appears in the deno executable, as
  template text. The test that settles it is importing with downloads blocked, not searching for names.
- **An unfiltered `strings` search on the executable returns minified JavaScript a line at a time**
  (hundreds of kilobytes). Extract only the names with `grep -o`.

## Verification

Run on 2026-11-01, with Deno 2.9.8 on arm64 macOS, in the scratchpad (nothing in the repo changed):

- `node:assert/strict` from an empty `DENO_DIR` with `--no-remote --no-npm --cached-only`: loaded and ran;
  no download folders created.
- `jsr:@std/assert@1` with the same flags: refused, naming the jsr.io URL it needed.
- `strings` on the deno executable, names only: `node:assert/strict` and five `ext:deno_node/...assert...`
  implementation files; `jsr:@std/assert@1` only inside the `deno init` template.
- Deno's Node compatibility and standard library pages, quoted above.

To repeat the first check (prints `ok`):

```sh
DENO_DIR=$(mktemp -d) deno eval --no-remote --no-npm 'import("node:assert/strict").then(() => console.log("ok"))'
```

## Decision

**Keep `node:assert/strict`** (2026-11-01). It needs no download and no lock file, and the four functions
the tests use cover what they need. Switching remains a mechanical edit across the tests plus a committed
`deno.lock`, if a future need for `@std/assert`'s extras ever outweighs the download.

## Follow-ups

- **Restrict `node:assert/strict` to `test/` in `lint:security`:** open. `toolchain.md` allows it for
  tests, but the linter's allowed-import list also accepts it in `src/`. Nothing in `src/` uses it today.
