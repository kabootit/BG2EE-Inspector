/**
 * `deno task install-mod`: install the inspector's WeiDU component into the game
 * (src/game/install_mod.ts); `--uninstall` removes it, restoring ui.menu from WeiDU's backup.
 */
import { installMod, pinnedWeidu } from "../game/install_mod.ts";
import { realSystem } from "../setup/system.ts";
import { GAME_DIR, MOD_DIR, WEIDU_BINARY } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

await runTask(async (): Promise<number> => {
  const uninstall = Deno.args.includes("--uninstall");
  try {
    const result = await installMod(
      realSystem,
      { gameDir: GAME_DIR, modDir: MOD_DIR, weidu: WEIDU_BINARY, weiduSha256: pinnedWeidu() },
      uninstall,
    );
    console.log(result.weiduOutput.trimEnd());
    for (const line of result.lines) console.log(`install-mod: ${line}`);
    return 0;
  } catch (error) {
    console.error(`install-mod: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
});
