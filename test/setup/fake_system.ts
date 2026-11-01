/** An in-memory `System` for tests: files in a map, commands answered by a handler. */
import type { RunResult, System } from "../../src/setup/system.ts";

export type Handler = (cmd: string, args: string[]) => RunResult | undefined;

export function fakeSystem(
  files: Record<string, Uint8Array | string> = {},
  handler: Handler = () => undefined,
  overrides: Partial<Pick<System, "os" | "arch" | "denoVersion">> = {},
): System & { files: Map<string, Uint8Array>; ran: string[][] } {
  const encoder = new TextEncoder();
  const store = new Map<string, Uint8Array>(
    Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? encoder.encode(v) : v]),
  );
  const ran: string[][] = [];
  return {
    os: "darwin",
    arch: "aarch64",
    denoVersion: "2.9.8",
    ...overrides,
    files: store,
    ran,
    run(cmd, args) {
      ran.push([cmd, ...args]);
      return Promise.resolve(handler(cmd, args) ?? { code: 1, stdout: "", stderr: "not handled" });
    },
    readBytes: (path) => Promise.resolve(store.get(path) ?? null),
    readText: (path) => {
      const bytes = store.get(path);
      return Promise.resolve(bytes ? new TextDecoder().decode(bytes) : null);
    },
    writeBytes: (path, bytes) => Promise.resolve(void store.set(path, bytes)),
    writeText: (path, text) => Promise.resolve(void store.set(path, encoder.encode(text))),
    exists: (path) =>
      Promise.resolve(store.has(path) || [...store.keys()].some((k) => k.startsWith(`${path}/`))),
    makeDir: () => Promise.resolve(),
    remove: (path) => {
      for (const k of [...store.keys()]) {
        if (k === path || k.startsWith(`${path}/`)) store.delete(k);
      }
      return Promise.resolve();
    },
    chmod: () => Promise.resolve(),
    listFiles: (dir) =>
      Promise.resolve([...store.keys()].filter((k) => k.startsWith(`${dir}/`)).sort()),
  };
}

/** A minimal thin Mach-O header for one CPU type (little-endian). */
export function thinMacho(cpuType: number): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, cpuType, true);
  return bytes;
}

/** A minimal universal (fat) header listing the given CPU types (big-endian). */
export function fatMacho(cpuTypes: number[]): Uint8Array {
  const bytes = new Uint8Array(8 + cpuTypes.length * 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xcafebabe, false);
  view.setUint32(4, cpuTypes.length, false);
  cpuTypes.forEach((cpu, i) => view.setUint32(8 + i * 20, cpu, false));
  return bytes;
}

export const ARM64 = 0x0100000c;
export const X86_64 = 0x01000007;
