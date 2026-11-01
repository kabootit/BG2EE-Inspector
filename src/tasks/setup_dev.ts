/** `deno task setup-dev`: install the contributor-only Lua 5.2.4 source into vendor/ (src/setup/install.ts). */
import { installLuaSource } from "../setup/install.ts";
import { realSystem } from "../setup/system.ts";
import { runTask } from "../shared/task.ts";

await runTask(async () => {
  try {
    const result = await installLuaSource(realSystem);
    for (const line of result.lines) console.log(`  ${line}`);
    return 0;
  } catch (error) {
    console.error(`setup-dev: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
});
