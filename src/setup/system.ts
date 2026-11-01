/**
 * The machine, as the setup code sees it.
 *
 * Doctor checks and installers take a `System` instead of calling Deno directly,
 * so tests can describe a machine (an Intel Mac, a missing game, an old WeiDU)
 * without having one. `realSystem` is the only implementation that touches the
 * machine; it never exits the process.
 */

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface System {
  os: string;
  arch: string;
  denoVersion: string;
  /** Run a binary with an argument array (never a shell string). */
  run(cmd: string, args: string[]): Promise<RunResult>;
  /** File bytes, or null if missing or unreadable. */
  readBytes(path: string): Promise<Uint8Array | null>;
  readText(path: string): Promise<string | null>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  makeDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  /** Every file below a directory, as absolute paths. */
  listFiles(dir: string): Promise<string[]>;
}

const decoder = new TextDecoder();

export const realSystem: System = {
  os: Deno.build.os,
  arch: Deno.build.arch,
  denoVersion: Deno.version.deno,

  async run(cmd, args) {
    try {
      const out = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
      return {
        code: out.code,
        stdout: decoder.decode(out.stdout),
        stderr: decoder.decode(out.stderr),
      };
    } catch (error) {
      return { code: -1, stdout: "", stderr: String(error) };
    }
  },

  async readBytes(path) {
    try {
      return await Deno.readFile(path);
    } catch {
      return null;
    }
  },

  async readText(path) {
    try {
      return await Deno.readTextFile(path);
    } catch {
      return null;
    }
  },

  writeBytes: (path, bytes) => Deno.writeFile(path, bytes),
  writeText: (path, text) => Deno.writeTextFile(path, text),

  async exists(path) {
    try {
      await Deno.stat(path);
      return true;
    } catch {
      return false;
    }
  },

  makeDir: (path) => Deno.mkdir(path, { recursive: true }),

  async remove(path) {
    try {
      await Deno.remove(path, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  },

  chmod: (path, mode) => Deno.chmod(path, mode),

  async listFiles(dir) {
    const found: string[] = [];
    async function walk(at: string) {
      for await (const entry of Deno.readDir(at)) {
        const path = `${at}/${entry.name}`;
        if (entry.isDirectory) await walk(path);
        else if (entry.isFile) found.push(path);
      }
    }
    await walk(dir);
    return found.sort();
  },
};
