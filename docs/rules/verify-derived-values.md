# Verify derived values

**Check a derived value against an observable outcome before reporting it as fact. If no check is
possible yet, say it is unvalidated, and gate the claim behind one documented constant.**

**Why:** correct inputs do not make a computed rule right, and a plausible rule produces plausible output,
so nothing in the numbers looks wrong. BG2EE-GameLog read saving-throw rows as saves attempted when they
were saves made, and a 0% failure rate went out twice as fact (GameLog gotcha 18). Every struct
offset in this project is that kind of value.

## How to apply

- **Validate offsets** against the engine's own values before trusting them: party stats must match
  `characters[id]` 100% before the inspector shows any enemy value (Phase 3 gate).
- **Validate durations** against observable removal: a fixed-duration spell must count down from its
  `.spl` duration and reach zero when the effect disappears, and nothing trusts the ticks-per-second
  constant until that passes (Phase 5 gate).
- **Omit unvalidated fields**, never guess them. `docs/data-model.md` records each field's validation
  status.
- **Claims from outside sources** (forum posts, Windows offsets) are starting hints, re-derived on the
  macOS binary before use.
- **Say "unvalidated"** in replies and notes for anything not yet checked, rather than quoting it.

Related: [working-together.md](working-together.md), [tests.md](tests.md).
