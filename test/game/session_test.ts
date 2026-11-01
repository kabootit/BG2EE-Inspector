import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { captureSession, type Host } from "../../src/game/session.ts";

// Built at run time so this file never contains a real-looking home path.
const HOME = "/Us" + "ers/alice";
const LAUNCH = { cmd: "/usr/bin/script", args: [] };

/** A stream the test writes to; it stays open, like a running game's output, until closed. */
function pipe() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  return {
    stream,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => {
      try {
        controller.close();
      } catch { /* the reader cancelled it */ }
    },
  };
}

/** A game that runs until it exits or is killed, and counts Ctrl+C subscriptions. */
function fakeGame() {
  const stdout = pipe();
  const stderr = pipe();
  const kills: Deno.Signal[] = [];
  let exited = false;
  let resolveStatus!: (status: { code: number }) => void;
  const status = new Promise<{ code: number }>((resolve) => (resolveStatus = resolve));
  let interrupt: (() => void) | undefined;
  let subscribed = 0;

  const exit = (code: number) => {
    exited = true;
    stdout.close();
    stderr.close();
    resolveStatus({ code });
  };
  const host: Host = {
    spawn: () => ({
      stdout: stdout.stream,
      stderr: stderr.stream,
      status,
      kill: (signal) => {
        if (exited) throw new Error("ESRCH");
        kills.push(signal);
        exit(143);
      },
    }),
    onInterrupt: (handler) => {
      subscribed++;
      interrupt = handler;
      return () => subscribed--;
    },
  };
  return {
    host,
    stdout,
    stderr,
    exit,
    kills,
    subscribed: () => subscribed,
    interrupt: () => interrupt?.(),
  };
}

Deno.test("a session hands every line on, cleaned and redacted, and returns a count", async () => {
  const game = fakeGame();
  const seen: string[] = [];
  const run = captureSession(LAUNCH, HOME, (line) => {
    seen.push(line);
    return Promise.resolve();
  }, game.host);
  game.stdout.write(`${HOME}/x\r\nsecond\n`);
  game.stderr.write("pty failed\n");
  game.exit(0);
  const result = await run;
  deepStrictEqual(result, { lineCount: 3, exitCode: 0 });
  deepStrictEqual(seen.toSorted(), ["$HOME/x", "script: pty failed", "second"]);
  strictEqual(game.subscribed(), 0);
});

Deno.test("Ctrl+C ends the game and the session returns its exit code", async () => {
  const game = fakeGame();
  const run = captureSession(LAUNCH, HOME, async () => {}, game.host);
  game.interrupt();
  strictEqual((await run).exitCode, 143);
  deepStrictEqual(game.kills, ["SIGTERM"]);
  strictEqual(game.subscribed(), 0);
});

Deno.test("a failed line ends the game, and the listener goes only once it has exited", async () => {
  const game = fakeGame();
  let subscribedAtFailure = -1;
  const run = captureSession(LAUNCH, HOME, (line) => {
    if (line !== "bad") return Promise.resolve();
    subscribedAtFailure = game.subscribed();
    return Promise.reject(new Error("disk full"));
  }, game.host);
  game.stdout.write("ok\nbad\n");
  await rejects(run, /disk full/);
  deepStrictEqual(game.kills, ["SIGTERM"]);
  strictEqual(subscribedAtFailure, 1);
  strictEqual(game.subscribed(), 0);
});

Deno.test("no line is handed on after the session returns", async () => {
  const game = fakeGame();
  let returned = false;
  let lateLines = 0;
  const run = captureSession(LAUNCH, HOME, async (line) => {
    if (returned) lateLines++;
    if (line === "bad") throw new Error("disk full");
    // Yield, so the other pipe's lines are still being handled when the failure lands.
    await new Promise((resolve) => setTimeout(resolve, 1));
  }, game.host);
  game.stderr.write("e1\ne2\ne3\n");
  game.stdout.write("bad\n");
  await rejects(run, /disk full/);
  returned = true;
  game.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  strictEqual(lateLines, 0);
});
