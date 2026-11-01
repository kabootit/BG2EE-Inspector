/**
 * Walking the repository for the linters.
 *
 * Paths are returned relative to the repo root with forward slashes, so findings
 * read the same on every machine and never contain a home directory.
 */

/** The repo root, derived from this file's location rather than the working directory. */
export const ROOT = decodeURIComponent(new URL("../", import.meta.url).pathname);

/** Directories that are never linted: generated, downloaded, or local-only. */
const SKIP_DIRS = new Set([".git", "vendor", "build", "logs", "node_modules", "test/e2e/saves"]);

export interface RepoFiles {
  /** Every file, relative to the root. */
  files: string[];
  /** Every directory, relative to the root, without a trailing slash. */
  dirs: string[];
}

/** List every file and directory under the root, skipping SKIP_DIRS. */
export async function walkRepo(root: string = ROOT): Promise<RepoFiles> {
  const files: string[] = [];
  const dirs: string[] = [];
  async function walk(rel: string) {
    for await (const entry of Deno.readDir(rel === "" ? root : `${root}${rel}`)) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory) {
        if (SKIP_DIRS.has(path) || SKIP_DIRS.has(entry.name)) continue;
        dirs.push(path);
        await walk(path);
      } else if (entry.isFile) {
        files.push(path);
      }
    }
  }
  await walk("");
  return { files: files.sort(), dirs: dirs.sort() };
}

/** Read a file by its repo-relative path. */
export function readRepoFile(path: string, root: string = ROOT): Promise<string> {
  return Deno.readTextFile(`${root}${path}`);
}
