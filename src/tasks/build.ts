/** `deno task build`: compile native/a7x.c to build/a7x.dylib and check it (src/build/dylib.ts). */
import { buildDylib } from "../build/dylib.ts";
import { realSystem } from "../setup/system.ts";
import { BUILD_DIR, DYLIB_PATH, DYLIB_SOURCE } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

await runTask(async () => {
  await realSystem.makeDir(BUILD_DIR);
  const result = await buildDylib(realSystem, DYLIB_SOURCE, DYLIB_PATH);
  if (!result.ok) {
    console.error(`build: ${result.detail}`);
    return 1;
  }
  console.log(`build: build/a7x.dylib (${result.detail})`);
  return 0;
});
