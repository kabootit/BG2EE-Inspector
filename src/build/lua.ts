/**
 * Building stock Lua 5.2.4 from vendor/lua-5.2.4 for the offline Lua tests.
 *
 * The interpreter is the reference the game's Lua matches (docs/re-notes.md), built with the
 * Command Line Tools into gitignored build/. POSIX features without readline, so nothing beyond
 * the CLT is needed. It runs only the project's own test files; it never ships.
 */
import type { System } from "../setup/system.ts";
import { BIN } from "../shared/config.ts";
import type { BuildResult } from "./dylib.ts";

/** The clang arguments for the interpreter: every Lua source except the bytecode compiler. */
export function luaCompileArgs(sources: string[], output: string): string[] {
  const c = sources.filter((f) => f.endsWith(".c") && !f.endsWith("/luac.c")).sort();
  return [
    "clang",
    "-arch",
    "arm64",
    "-std=gnu99",
    "-O2",
    "-DLUA_COMPAT_ALL",
    "-DLUA_USE_POSIX",
    "-DLUA_USE_DLOPEN",
    "-w",
    "-o",
    output,
    ...c,
  ];
}

/** Build the interpreter from `srcDir` into `output`. */
export async function buildLua(sys: System, srcDir: string, output: string): Promise<BuildResult> {
  const sources = await sys.listFiles(srcDir);
  if (!sources.some((f) => f.endsWith("/lapi.c"))) {
    return { ok: false, detail: `no Lua source in ${srcDir}; run deno task setup-dev` };
  }
  const built = await sys.run(BIN.xcrun, luaCompileArgs(sources, output));
  return built.code === 0
    ? { ok: true, detail: "Lua 5.2.4" }
    : { ok: false, detail: `clang failed:\n${built.stderr.trim()}` };
}
