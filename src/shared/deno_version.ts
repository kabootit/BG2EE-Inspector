/**
 * The Deno version this project requires.
 *
 * Every task runs through `runTask()` (src/shared/task.ts), which checks this
 * first, so running a task on an older Deno fails with one clear line instead of
 * an obscure error deeper in. The minimum is the version the project is
 * developed and tested on; raise it here and in docs/requirements.md together.
 */
export const MIN_DENO = "2.9.8";

/** Compare dotted numeric versions. Negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** A message if the running Deno is older than MIN_DENO, otherwise null. */
export function denoVersionProblem(running: string = Deno.version.deno): string | null {
  return compareVersions(running, MIN_DENO) < 0
    ? `This project requires Deno ${MIN_DENO} or later; this is Deno ${running}. ` +
      `See docs/requirements.md.`
    : null;
}
