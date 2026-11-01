/**
 * Running the game and capturing what it prints.
 *
 * Every line is cleaned and redacted before anything else sees it, then handed
 * to `onLine`, which writes the session log and echoes to the terminal. Returns
 * the captured lines once the game exits.
 */
import { clean, LineBuffer, redact } from "./capture.ts";
import type { Launch } from "./launch.ts";

export async function captureSession(
  launch: Launch,
  home: string,
  onLine: (line: string) => Promise<void>,
): Promise<{ lines: string[]; exitCode: number }> {
  const child = new Deno.Command(launch.cmd, {
    args: launch.args,
    stdin: "null",
    stdout: "piped",
    // script's own stderr: pty setup failures. The game's stderr is merged into the pty.
    stderr: "piped",
  }).spawn();

  const lines: string[] = [];
  const handle = async (raw: string) => {
    const line = redact(clean(raw), home);
    lines.push(line);
    await onLine(line);
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
  Deno.addSignalListener("SIGINT", stop);
  try {
    // Both pipes must be drained: an unread pipe fills and blocks the child.
    await Promise.all([drain(child.stdout, ""), drain(child.stderr, "script: ")]);
    return { lines, exitCode: (await child.status).code };
  } finally {
    Deno.removeSignalListener("SIGINT", stop);
  }
}
