/**
 * Installing the inspector's WeiDU component (mod/inspector/inspector.tp2) into the game, and
 * uninstalling it, with the project's own WeiDU. Adapted from BG2EE-GameLog's install_mod.ts, with
 * one difference: GameLog borrows any `setup-*` binary it finds in the game folder and asks before
 * running it, while this runs only vendor/weidu/weidu, from `deno task setup-weidu`, and only when
 * its SHA-256 is the pinned release's (ADR-0003). Nothing is copied into the game folder as a
 * binary.
 *
 * Built on `System`, so tests describe a game folder and a WeiDU run without touching either.
 */
import { KNOWN_WEIDU, WEIDU_RELEASE } from "../shared/config.ts";
import { sha256Hex } from "../shared/sha256.ts";
import type { System } from "../setup/system.ts";

/** The component's folder in the game folder, and its tp2 there, as WeiDU is given it. */
export const MOD_FOLDER = "inspector";
export const TP2 = `${MOD_FOLDER}/inspector.tp2`;

/**
 * What a run works with: the game folder, the repo's mod folder, the vendored WeiDU, and the SHA-256
 * it must have (the task passes `pinnedWeidu()`; tests, their fake binary's).
 */
export type ModSetup = { gameDir: string; modDir: string; weidu: string; weiduSha256: string };

/** What a run did: the lines to show, then WeiDU's own output. */
export type ModResult = { lines: string[]; weiduOutput: string };

/** WeiDU's arguments; it runs in the game folder, so the tp2 and its COPY paths are relative to it. */
export function weiduArgs(gameDir: string, uninstall: boolean): string[] {
  return [
    "--game",
    gameDir,
    TP2,
    uninstall ? "--force-uninstall" : "--force-install",
    "0",
    "--language",
    "0",
    "--no-exit-pause",
  ];
}

/**
 * Whether a WeiDU.log lists the component: WeiDU writes the tp2 path in capitals, then the language
 * and component numbers, as `~INSPECTOR/INSPECTOR.TP2~ #0 #0 // ...`.
 */
export function listsComponent(log: string): boolean {
  const entry = `~${TP2.toUpperCase()}~ #0 #0`;
  return log.split("\n").some((line: string): boolean =>
    line.trim().toUpperCase().startsWith(entry)
  );
}

/** The SHA-256 of the pinned WeiDU binary, the only one the task runs. */
export function pinnedWeidu(): string {
  const pinned = KNOWN_WEIDU.find((w) => w.version === WEIDU_RELEASE.version && w.arch === "arm64");
  if (!pinned) throw new Error(`no known binary for the pinned WeiDU v${WEIDU_RELEASE.version}`);
  return pinned.sha256;
}

/**
 * Copy every file of `from` into `to`, merging: nothing already in `to` is removed or emptied, so
 * WeiDU's uninstall data in `inspector/backup/` survives a reinstall. Returns how many were copied.
 */
async function mergeInto(sys: System, from: string, to: string): Promise<number> {
  const files = await sys.listFiles(from);
  for (const file of files) {
    const dest = `${to}${file.slice(from.length)}`;
    const bytes = await sys.readBytes(file);
    if (bytes === null) throw new Error(`could not read ${file}`);
    await sys.makeDir(dest.slice(0, dest.lastIndexOf("/")));
    await sys.writeBytes(dest, bytes);
  }
  return files.length;
}

/**
 * Install (or with `uninstall`, remove) the component. Throws, before anything is written, when the
 * game folder has no `chitin.key` or WeiDU is missing or not the pinned binary; throws after the
 * copy, with WeiDU's output, when WeiDU fails or `WeiDU.log` does not show the change.
 */
export async function installMod(
  sys: System,
  setup: ModSetup,
  uninstall: boolean,
): Promise<ModResult> {
  const { gameDir, modDir, weidu, weiduSha256 } = setup;
  if (!(await sys.exists(`${gameDir}/chitin.key`))) {
    throw new Error(`not a game folder (no chitin.key): ${gameDir}`);
  }
  const binary = await sys.readBytes(weidu);
  if (binary === null) throw new Error("no WeiDU in vendor/weidu; run deno task setup-weidu");
  const sha = await sha256Hex(binary);
  if (sha !== weiduSha256) {
    throw new Error(
      `vendor/weidu/weidu is not the pinned WeiDU v${WEIDU_RELEASE.version} arm64 (SHA-256 ${sha}); run deno task setup-weidu`,
    );
  }

  const copied = await mergeInto(sys, modDir, `${gameDir}/${MOD_FOLDER}`);
  const lines = [
    `WeiDU v${WEIDU_RELEASE.version} arm64, SHA-256 matches the pinned release`,
    `copied ${copied} files into the game folder's ${MOD_FOLDER}/`,
  ];

  const out = await sys.run(weidu, weiduArgs(gameDir, uninstall), gameDir);
  const weiduOutput = `${out.stdout}${out.stderr}`;
  if (out.code !== 0) {
    throw new Error(`WeiDU exited with code ${out.code}:\n${weiduOutput.trimEnd()}`);
  }
  // The exit code is not enough: WeiDU exits 0 after a FATAL ERROR, such as a tp2 it cannot parse.
  // WeiDU.log is what it writes only on success.
  const listed = listsComponent((await sys.readText(`${gameDir}/WeiDU.log`)) ?? "");
  if (listed === uninstall) {
    const state = uninstall ? "still lists" : "does not list";
    throw new Error(`WeiDU.log ${state} ${TP2} after WeiDU ran:\n${weiduOutput.trimEnd()}`);
  }
  lines.push(uninstall ? "uninstalled" : "installed");
  return { lines, weiduOutput };
}
