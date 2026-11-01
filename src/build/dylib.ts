/**
 * Compiling and checking a dylib.
 *
 * Shared by `deno task build` (the inspector's library) and doctor's test build,
 * so both use the same flags and the same checks: arm64, and ad-hoc signed by
 * the linker. Warnings are errors (docs/plans: C builds with -Wall -Wextra -Werror).
 */
import { BIN } from "../shared/config.ts";
import { machoArchs } from "../re/macho.ts";
import type { System } from "../setup/system.ts";

/** The clang arguments for an arm64 dylib from one C source. */
export function compileArgs(source: string, output: string): string[] {
  return [
    "clang",
    "-arch",
    "arm64",
    "-dynamiclib",
    "-std=c17",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-o",
    output,
    source,
  ];
}

export type BuildResult = { ok: true; detail: string } | { ok: false; detail: string };

/** Compile `source` to `output`, then confirm the result is arm64 and ad-hoc signed. */
export async function buildDylib(
  sys: System,
  source: string,
  output: string,
): Promise<BuildResult> {
  const built = await sys.run(BIN.xcrun, compileArgs(source, output));
  if (built.code !== 0) return { ok: false, detail: `clang failed:\n${built.stderr.trim()}` };
  return await verifyDylib(sys, output);
}

/** Whether an existing dylib is arm64 and carries an ad-hoc signature. */
export async function verifyDylib(sys: System, path: string): Promise<BuildResult> {
  const bytes = await sys.readBytes(path);
  const archs = bytes ? machoArchs(bytes) : [];
  if (!archs.includes("arm64")) {
    return {
      ok: false,
      detail: `${path} is ${archs.join(", ") || "missing or not Mach-O"}, not arm64`,
    };
  }
  const sig = await sys.run(BIN.codesign, ["-dv", path]);
  if (!/Signature=adhoc/.test(sig.stderr + sig.stdout)) {
    return { ok: false, detail: `${path} is not ad-hoc signed` };
  }
  return { ok: true, detail: "arm64, Signature=adhoc" };
}
