/**
 * `deno task install-mod`: install the inspector's WeiDU component into the game
 * (src/game/install_mod.ts), with the names table built from the game's spell and item files
 * (src/gamefiles/names.ts); `--uninstall` removes it, restoring ui.menu from WeiDU's backup.
 */
import { installMod, pinnedWeidu } from "../game/install_mod.ts";
import { namesLua, nameStrrefs } from "../gamefiles/names.ts";
import { openGameFiles, openStringTable } from "../gamefiles/resources.ts";
import { realSystem } from "../setup/system.ts";
import { GAME_DIR, MOD_DIR, WEIDU_BINARY } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

/**
 * The names table's Lua, from the installed game's files. The English dialog.tlk only decides which
 * strrefs have text; the game fetches each in its own language.
 */
async function names(): Promise<string> {
  const files = await openGameFiles(GAME_DIR);
  const strings = await openStringTable(files);
  if (!strings) throw new Error(`no lang/en_US/dialog.tlk in ${GAME_DIR}`);
  const table = await nameStrrefs(files, strings);
  console.log(`install-mod: ${table.size} spell and item names found in the game's files`);
  return namesLua(table);
}

await runTask(async (): Promise<number> => {
  const uninstall = Deno.args.includes("--uninstall");
  try {
    const result = await installMod(
      realSystem,
      {
        gameDir: GAME_DIR,
        modDir: MOD_DIR,
        weidu: WEIDU_BINARY,
        weiduSha256: pinnedWeidu(),
        names: uninstall ? undefined : await names(),
      },
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
