/**
 * Running the game and capturing what it prints.
 *
 * Every line is cleaned and redacted before anything else sees it, then handed
 * to `onLine`, which writes the session log and echoes to the terminal. Returns
 * the line count once the game has exited and every line has been handed on.
 */
import { clean, LineBuffer, redact } from "./capture.ts";
import type { Launch } from "./launch.ts";

/** The running game, as much of `Deno.ChildProcess` as a session uses. */
export interface Child {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  status: Promise<{ code: number }>;
  kill(signal: Deno.Signal): void;
}

/** Starting processes and hearing Ctrl+C, injectable so tests need no game. */
export interface Host {
  spawn(launch: Launch): Child;
  /** Calls `handler` on SIGINT until the returned function is called. */
  onInterrupt(handler: () => void): () => void;
}

export const realHost: Host = {
  spawn: (launch) =>
    new Deno.Command(launch.cmd, {
      args: launch.args,
      stdin: "null",
      stdout: "piped",
      // script's own stderr: pty setup failures. The game's stderr is merged into the pty.
      stderr: "piped",
    }).spawn(),
  onInterrupt: (handler) => {
    Deno.addSignalListener("SIGINT", handler);
    return () => Deno.removeSignalListener("SIGINT", handler);
  },
};

export async function captureSession(
  launch: Launch,
  home: string,
  onLine: (line: string) => Promise<void>,
  host: Host = realHost,
): Promise<{ lineCount: number; exitCode: number }> {
  const child = host.spawn(launch);

  // A count, not the lines: a session can run for hours, and onLine already keeps what matters.
  let lineCount = 0;
  const handle = async (raw: string) => {
    lineCount++;
    await onLine(redact(clean(raw), home));
  };

  const drain = async (stream: ReadableStream<Uint8Array>, prefix: string) => {
    const buffer = new LineBuffer();
    for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
      for (const line of buffer.push(chunk)) await handle(prefix + line);
    }
    for (const line of buffer.flush()) await handle(prefix + line);
  };

  const stop = () => {
    try {
      child.kill("SIGTERM");
    } catch { /* already gone */ }
  };
  const unsubscribe = host.onInterrupt(stop);
  try {
    // Both pipes must be drained: an unread pipe fills and blocks the child.
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
}
