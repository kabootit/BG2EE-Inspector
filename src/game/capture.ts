/**
 * Turning the game's raw output into clean, redacted lines.
 *
 * Pure functions, so the awkward parts (lines split across reads, pty artifacts,
 * redaction) are tested without launching anything.
 */

/**
 * Collects decoded text into whole lines.
 *
 * A read can end mid-line; the remainder waits for the next chunk. `flush()`
 * returns whatever is left when the stream ends.
 */
export class LineBuffer {
  #rest = "";

  push(chunk: string): string[] {
    const parts = (this.#rest + chunk).split("\n");
    this.#rest = parts.pop() ?? "";
    return parts;
  }

  flush(): string[] {
    const rest = this.#rest;
    this.#rest = "";
    return rest === "" ? [] : [rest];
  }
}

/**
 * Remove pty artifacts: the carriage return the pty adds to every line, and the
 * `^D` plus two backspaces macOS `script` echoes when its input ends. With stdin
 * from /dev/null that is at once, so it lands at the start of the first line.
 */
export function clean(line: string): string {
  let out = line.endsWith("\r") ? line.slice(0, -1) : line;
  while (out.startsWith(EOF_ARTIFACT)) out = out.slice(EOF_ARTIFACT.length);
  return out;
}

/** What macOS `script` echoes at end of input: a caret-D, then two backspaces. */
const EOF_ARTIFACT = "^D\b\b";

/**
 * Strip identifying details before a line is written: the home directory (which
 * contains the user name) and the Steam account id the engine prints at startup.
 * Done at capture, never as a cleanup pass (docs/rules/security-first.md).
 */
export function redact(line: string, home: string): string {
  // A replacer function, not a string: "$HOME" in a replacement string would be read as a pattern.
  const withoutHome = home === "" ? line : line.replaceAll(home, () => "$HOME");
  return withoutHome
    .replace(/\b7656\d{13}\b/g, "<steam-id>")
    .replace(/(Steam ID:\s*)\d{5,}/gi, "$1<steam-id>");
}

/** Session file name stamp in local time, fixed width so names sort by time: `20261101-184105`. */
export function stamp(now: Temporal.PlainDateTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.year}${pad(now.month)}${pad(now.day)}-${pad(now.hour)}${pad(now.minute)}${
    pad(now.second)
  }`;
}
