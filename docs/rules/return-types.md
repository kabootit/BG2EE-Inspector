# Return types

**Every function states its return type: every `function` declaration and method, and every exported
function, arrow functions included. Nothing has the type `any`.**

**Why:** an inferred return type follows the body. Change the body and the type changes with it, and
every caller takes the new shape without a line anywhere that says so. A stated type is a contract
the type checker holds the body to, and a reader sees the shape at the signature instead of working it
out from the code. Code review of `src/game/tp2.ts` (2026-11-14) found what inference had let through: a
callback whose arguments were `any`, so the group a `\1` stood for was `any`, and an optional regexp
group typed `string` that was `undefined` whenever the keyword was absent. The same reasoning as the
[central schemas](../learnings/2026-11-14-central-schemas.md): a shape written down once, at the
boundary, is where drift is caught.

## How to apply

- **`deno task lint` enforces it.** `deno.json` turns on two `deno lint` rules:
  `explicit-function-return-type` (every declaration and method) and
  `explicit-module-boundary-types` (every export, arrow functions included). A missing return type
  fails the lint, so it fails before a commit.
- **A shape with more than a field or two gets a named type**, so the signature reads as a name:
  `Tp2`, `Instructions`, `FakeGame`.
- **Absence is in the type.** A value that can be missing is `T | undefined` (or `| null`, as the API
  it comes from has it), never a `T` that is sometimes not there. Shape the code so the type can be
  honest, as `(EVALUATE_BUFFER\s+|)` matches an empty string rather than leaving a group unset.
- **Inline callbacks** take their types from the call that receives them, such as `.map` on a typed
  array, and need nothing more. Type their parameters when that source is loose: `String.replace`'s
  callback receives the match, each group, an offset and the whole text, so its rest parameter is
  `unknown[]`, not `any[]`.
- **TypeScript only.** Lua has no type annotations, and the C prototypes in `native/` already state
  theirs.

Related: [tests.md](tests.md), [minimal-surface.md](minimal-surface.md).
