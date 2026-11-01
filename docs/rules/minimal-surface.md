# Minimal surface

**Build the smallest surface that does the job. Before adding an aid, name its consumer and what breaks
without it.**

**Why:** every extra function, file or option is something to keep correct across game updates. The
Tranquil project cut nine pieces from one SDK after they shipped, and then a whole command line, because
each had a weak use case. This project has already dropped a UI panel (deferred to an external mod), an
auto-print-on-hover mode, and a vendored JSON library for the same reason.

## How to apply

- Name the consumer of an aid and what fails without it, before building it.
- If an existing primitive or a simpler rule covers it, don't build it.
- When cutting something, record the removed piece and why under "Options considered" in the ADR, so the
  reasoning survives.
- The public `A7X` API grows only when a real consumer needs a function (minor version), never by
  analogy with another tool.

Related: [docs.md](docs.md).
