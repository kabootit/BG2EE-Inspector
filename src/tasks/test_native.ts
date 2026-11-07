/**
 * `deno task test:native`: compile each test/native/*_test.c with the library's own warning flags
 * into build/test/ and run it. When the game is installed, each test gets the path of its arm64
 * slice (written to build/test/) as its argument, so it can check builds.h against the real bytes.
 */
import { archSlice } from "../re/macho.ts";
import { realSystem } from "../setup/system.ts";
import { BIN, BUILD_DIR, GAME_BINARY, LUA_DIR } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

const TEST_DIR = `${BUILD_DIR}/test`;

/** clang arguments for one native test: the library's flags, OpenGL, and the Lua headers. */
const nativeTestArgs = (source: string, output: string) => [
  "clang",
  "-arch",
  "arm64",
  "-std=c17",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-framework",
  "OpenGL",
  "-I",
  `${LUA_DIR}/src`,
  "-o",
  output,
  source,
];

await runTask(async () => {
  await realSystem.makeDir(TEST_DIR);
  const bytes = await realSystem.readBytes(GAME_BINARY);
  const slice = bytes && archSlice(bytes, "arm64");
  const slicePath = `${TEST_DIR}/game-arm64`;
  if (slice) await realSystem.writeBytes(slicePath, slice);
  else console.log("test:native: game not installed; site checks against the slice are skipped");

  const sources = (await realSystem.listFiles("test/native")).filter((f) => f.endsWith("_test.c"))
    .sort();
  let failed = 0;
  for (const source of sources) {
    const name = source.split("/").pop()!.replace(/\.c$/, "");
    const built = await realSystem.run(BIN.xcrun, nativeTestArgs(source, `${TEST_DIR}/${name}`));
    if (built.code !== 0) {
      console.error(`test:native: ${source} did not compile:\n${built.stderr.trim()}`);
      failed++;
      continue;
    }
    // Repo-relative, as deno.json's --allow-run names each test binary.
    const run = await realSystem.run(`./build/test/${name}`, slice ? [slicePath] : []);
    console.log(`${source}\n${(run.stdout + run.stderr).trimEnd()}`);
    if (run.code !== 0) failed++;
  }
  console.log(`test:native: ${sources.length - failed} of ${sources.length} files passed`);
  return failed === 0 && sources.length > 0 ? 0 : 1;
});
