/**
 * `deno task test:lua`: run every test/lua/*_test.lua with stock Lua 5.2.4 (src/build/lua.ts),
 * building the interpreter into build/lua first if it is not there. Each test file prints its own
 * results and exits non-zero on a failure; this task fails if any does.
 */
import { buildLua } from "../build/lua.ts";
import { realSystem } from "../setup/system.ts";
import { BUILD_DIR, LUA_DIR } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

/** Repo-relative, as deno.json's --allow-run names it. */
const LUA = "./build/lua";

await runTask(async () => {
  if (!(await realSystem.exists(`${BUILD_DIR}/lua`))) {
    await realSystem.makeDir(BUILD_DIR);
    const built = await buildLua(realSystem, `${LUA_DIR}/src`, `${BUILD_DIR}/lua`);
    if (!built.ok) {
      console.error(`test:lua: ${built.detail}`);
      return 1;
    }
  }
  const tests = (await realSystem.listFiles("test/lua")).filter((f) => f.endsWith("_test.lua"))
    .sort();
  let failed = 0;
  for (const file of tests) {
    const out = await realSystem.run(LUA, [file]);
    console.log(`${file}\n${out.stdout.trimEnd()}${out.stderr ? `\n${out.stderr.trimEnd()}` : ""}`);
    if (out.code !== 0) failed++;
  }
  console.log(`test:lua: ${tests.length - failed} of ${tests.length} files passed`);
  return failed === 0 && tests.length > 0 ? 0 : 1;
});
