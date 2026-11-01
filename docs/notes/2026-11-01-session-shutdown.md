---
title: "Game session shutdown and memory: Delivery Notes"
description: "Review of captureSession in src/game/session.ts: the SIGINT listener was always removed, but a failed line returned while the game still ran and let lines reach a closed log, and every line was held in memory. Fixed with an injectable host, allSettled and a line count; tests written first and run against the old code, plus a stand-in process check."
---

# Game session shutdown and memory: Delivery Notes

> Delivery record for a review of `src/game/session.ts` during review of Phase 0
> (`initial/03-injection`). It changes how a session ends on failure, with no design decision behind
> it, so it has no ADR; the [Phase 0 note](2026-11-01-injection.md) covers what the launcher is for.

## Status

**Done; tests pass, and a stand-in process confirms the game ends on both kinds of stop.**

| Piece | State |
| --- | --- |
| `src/game/session.ts`: injectable host, failure path, line count | Done |
| `src/game/launch.ts`, `src/tasks/play.ts`: summary from marker lines only | Done |
| `test/game/session_test.ts` | Done; written first and run against the old logic |
| Real-process check with a stand-in for the game | Done, before and after |

## Plan summary

Two questions were raised in review, about this block:

```ts
Deno.addSignalListener("SIGINT", stop);
try {
  await Promise.all([drain(child.stdout, ""), drain(child.stderr, "script: ")]);
  return { lines, exitCode: (await child.status).code };
} finally {
  Deno.removeSignalListener("SIGINT", stop);
}
```

- **Is there a possibility of a memory leak?**
- **Is the signal listener guaranteed to be removed?**

The answers, and what reading the block closely turned up:

| Question or finding | Answer |
| --- | --- |
| Listener removed? | **Yes, on every path that ends.** The removal is in `finally`, so it runs after a normal exit and after a failure. If `spawn()` throws, the listener was never added. The only path that skips it is a call that never ends, and that only happens while the game runs, when the listener should be there. `runTask` exits the process right after anyway. |
| Memory leak? | **No leak, but unbounded growth.** Every captured line was kept in `lines` until the game exited, about the size of the session log (222 KB for a 10-minute session), and Phase 4's data lines would make it grow faster. The caller used it only for a count and the load markers. |
| Found: failure returns while the game runs | If `onLine` failed (a full disk, for example), `Promise.all` rejected at once. The listener was removed and the session returned while the game was still running, so Ctrl+C no longer reached it. |
| Found: lines after return | The other pipe's drain kept going after the rejection. In `play.ts`, its next lines would be written to a log already closed by `play`'s own `finally`. |

## What was built

### Before

The process was spawned inside the function, every line was kept, and the first failure ended the wait:

```ts
const child = new Deno.Command(launch.cmd, { /* stdin null, stdout and stderr piped */ }).spawn();

const lines: string[] = [];
const handle = async (raw: string) => {
  const line = redact(clean(raw), home);
  lines.push(line);
  await onLine(line);
};
// drain(stream, prefix): read lines, hand each to handle

Deno.addSignalListener("SIGINT", stop);
try {
  await Promise.all([drain(child.stdout, ""), drain(child.stderr, "script: ")]);
  return { lines, exitCode: (await child.status).code };
} finally {
  Deno.removeSignalListener("SIGINT", stop);
}
```

### After

The process and the Ctrl+C subscription come from a `Host`, injectable like `System` in `src/setup/`. A
failure stops the game, and the function returns only when both pipes are finished and the game has
exited:

```ts
export interface Host {
  spawn(launch: Launch): Child;
  /** Calls `handler` on SIGINT until the returned function is called. */
  onInterrupt(handler: () => void): () => void;
}

let lineCount = 0;
const handle = async (raw: string) => {
  lineCount++;
  await onLine(redact(clean(raw), home));
};

const unsubscribe = host.onInterrupt(stop);
try {
  const drains = [drain(child.stdout, ""), drain(child.stderr, "script: ")];
  // A failed drain has stopped reading its pipe, so end the game; its other pipe then closes.
  for (const d of drains) d.catch(stop);
  // Wait for both, so no line reaches onLine after this returns, then for the exit.
  const results = await Promise.allSettled(drains);
  const { code } = await child.status;
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
  return { lineCount, exitCode: code };
} finally {
  unsubscribe();
}
```

`play.ts` keeps only the lines that pass `isLoadMarker` (one per launch) and passes them to `summarize`,
which no longer counts lines.

### Comparison

How the two versions behave in each situation:

| | Before | After |
| --- | --- | --- |
| Game exits normally | Returns the lines and exit code; listener removed | Returns the line count and exit code; listener removed |
| Ctrl+C | Sends SIGTERM to `script`; returns exit code 143 | The same |
| `onLine` fails | Rejects at once. The game keeps running until it next prints. Ctrl+C no longer handled | Sends SIGTERM to `script`, waits for both pipes and the exit, then rejects with the original error |
| Lines after return | Possible: 2 lines reached `onLine` after the rejection in the test | None: `allSettled` waits for both drains |
| Listener removed while the game runs | Yes, on the failure path | No; removed only after the exit |
| Memory | Every line, for the whole session | One number, plus the marker lines `play` keeps |
| Testable without a game | No: `Deno.Command` and signals were called directly | Yes: a fake `Host` drives every case with no permissions |

**Costs:**

- **`session.ts` grows from 52 to 84 lines**, mostly the `Host` and `Child` interfaces and the real host.
- **A fourth parameter** on `captureSession`, defaulting to the real host, so callers do not change.
- **The return shape changed** from `lines` to `lineCount`, with its one caller updated.

**Benefits:**

- **A failure ends the session cleanly:** the game is stopped, Ctrl+C keeps working until it has exited,
  and the original error is the one reported.
- **Nothing writes to the log after `play` closes it.**
- **Memory no longer grows with the session.**
- **The shutdown rules are tested**, where before only the pure helpers around them were.

## Gotchas worth remembering

- **An earlier explanation was wrong, and the stand-in showed it.** The first reading of the failure path
  said the failed pipe would go unread, fill up and freeze the game. In fact, a `for await` loop that
  exits by throwing cancels its stream, so our end of the pipe closes instead. With the old code, the
  stand-in was still running right after the session failed and gone half a second later, without being
  killed. The likely mechanism is that its next line broke `script` with a write to a closed pipe, and the
  pty closing ended the stand-in. So the old failure path left the game running only until it next
  printed, not for good. The fix still matters: a quiet game would keep running, and Ctrl+C was no longer
  handled in the meantime.
- **SIGTERM to `script` ends the game too.** `stop` signals `script`, not the game. The stand-in check
  confirms the game process ends with it, on both a failure and Ctrl+C, with nothing left running.
- **`d.catch(stop)` does not swallow the error.** It attaches a second handler; `allSettled` still sees the
  rejection, and the function rethrows it once the game has exited.
- **Tests first, against the old code.** The injectable host went in first with no change in behaviour.
  Then the tests ran against the old logic: two failed on the real bugs (no SIGTERM on failure; 2 lines
  after return), one on the planned change of return shape, and the Ctrl+C test passed.

## Verification

Run on 2026-11-01:

- **Before the fix:** `test/game/session_test.ts` against the old logic behind the injectable host. 1
  passed, 3 failed as described above.
- **After the fix:** the same four tests pass. `deno task lint` passes: fmt, lint, type-check, 66 tests,
  `lint:docs` and `lint:security`.
- **Stand-in process**, a small C program printing a line every 100 ms for 30 seconds, launched through
  `script` with the real host. Both runs were in the scratchpad, outside the repo:
  - **New code, a failing line:** rejected with the original error after 6 lines, in 736 ms; the stand-in
    was not running afterwards.
  - **New code, SIGINT:** returned exit code 143 in 708 ms; the stand-in was not running afterwards.
  - **Old code, a failing line:** rejected in 539 ms with the stand-in still running; it had exited half a
    second later.
- **The game was not launched** for this change; the launch arguments and the capture path are unchanged.

## Follow-ups

- **No escalation past SIGTERM.** If `script` ever ignored SIGTERM, Ctrl+C would not end `play`, since the
  handler replaces Deno's default exit. Not seen here; a second Ctrl+C could send SIGKILL if it ever is.
