/** `deno task setup-weidu`: install the pinned WeiDU release into vendor/weidu (src/setup/install.ts). */
import { installWeidu } from "../setup/install.ts";
import { realSystem } from "../setup/system.ts";
import { runTask } from "../shared/task.ts";

await runTask(async () => {
  try {
    const result = await installWeidu(realSystem);
    for (const line of result.lines) console.log(`  ${line}`);
    return 0;
  } catch (error) {
    console.error(`setup-weidu: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
});
