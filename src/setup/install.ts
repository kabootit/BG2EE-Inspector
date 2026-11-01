/**
 * Installing the two pinned downloads into vendor/.
 *
 * Each install is idempotent: a `.installed` file records the archive SHA-256,
 * and a matching record means there is nothing to do. The archive is verified
 * before it is written or unpacked (download.ts).
 */
import {
  BIN,
  LUA_DIR,
  LUA_RELEASE,
  VENDOR_DIR,
  WEIDU_BINARY,
  WEIDU_DIR,
  WEIDU_RELEASE,
} from "../shared/config.ts";
import type { Download } from "../shared/config.ts";
import { sha256Hex } from "../shared/sha256.ts";
import { machoArchs } from "../re/macho.ts";
import { downloadVerified, type Fetch } from "./download.ts";
import type { System } from "./system.ts";

export interface InstallResult {
  /** True when a matching install was already present. */
  skipped: boolean;
  lines: string[];
}

async function alreadyInstalled(sys: System, dir: string, release: Download): Promise<boolean> {
  return (await sys.readText(`${dir}/.installed`))?.trim() === release.sha256;
}

/** WeiDU v251 for arm64 from its GitHub release, unpacked with macOS's built-in ditto. */
export async function installWeidu(sys: System, fetchFn?: Fetch): Promise<InstallResult> {
  if (await alreadyInstalled(sys, WEIDU_DIR, WEIDU_RELEASE) && await sys.exists(WEIDU_BINARY)) {
    return {
      skipped: true,
      lines: [`WeiDU v${WEIDU_RELEASE.version} already installed in vendor/weidu`],
    };
  }
  const lines: string[] = [];
  const zip = await downloadVerified(WEIDU_RELEASE, fetchFn);
  lines.push(`downloaded ${WEIDU_RELEASE.url}`, `SHA-256 matches ${WEIDU_RELEASE.checksumSource}`);

  await sys.remove(WEIDU_DIR);
  await sys.makeDir(WEIDU_DIR);
  const zipPath = `${WEIDU_DIR}/weidu-${WEIDU_RELEASE.version}.zip`;
  const extractDir = `${WEIDU_DIR}/extract`;
  await sys.writeBytes(zipPath, zip);

  const quarantine = await sys.run(BIN.xattr, ["-p", "com.apple.quarantine", zipPath]);
  lines.push(
    quarantine.code === 0 ? "quarantine attribute: present" : "quarantine attribute: none",
  );

  const unzip = await sys.run(BIN.ditto, ["-x", "-k", zipPath, extractDir]);
  if (unzip.code !== 0) throw new Error(`ditto failed: ${unzip.stderr.trim()}`);

  const candidates = (await sys.listFiles(extractDir)).filter((p) => p.endsWith("/weidu"));
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one "weidu" binary in the archive, found ${candidates.length}`,
    );
  }
  lines.push(`archive layout: ${candidates[0].slice(extractDir.length + 1)}`);

  const binary = await sys.readBytes(candidates[0]);
  if (binary === null) throw new Error("could not read the unpacked weidu binary");
  const archs = machoArchs(binary);
  if (!archs.includes("arm64")) {
    throw new Error(`the unpacked weidu is ${archs.join(", ")}, not arm64`);
  }

  await sys.writeBytes(WEIDU_BINARY, binary);
  await sys.chmod(WEIDU_BINARY, 0o755);
  await sys.remove(extractDir);
  await sys.writeText(`${WEIDU_DIR}/.installed`, `${WEIDU_RELEASE.sha256}\n`);
  lines.push(
    `installed vendor/weidu/weidu (${archs.join(" + ")}, SHA-256 ${await sha256Hex(binary)})`,
  );
  return { skipped: false, lines };
}

/** The Lua 5.2.4 source from lua.org, unpacked with the system tar. Contributors only. */
export async function installLuaSource(sys: System, fetchFn?: Fetch): Promise<InstallResult> {
  if (
    await alreadyInstalled(sys, LUA_DIR, LUA_RELEASE) && await sys.exists(`${LUA_DIR}/src/lapi.c`)
  ) {
    return {
      skipped: true,
      lines: [`Lua ${LUA_RELEASE.version} source already in vendor/lua-5.2.4`],
    };
  }
  const lines: string[] = [];
  const archive = await downloadVerified(LUA_RELEASE, fetchFn);
  lines.push(`downloaded ${LUA_RELEASE.url}`, `SHA-256 matches ${LUA_RELEASE.checksumSource}`);

  await sys.makeDir(VENDOR_DIR);
  await sys.remove(LUA_DIR);
  const archivePath = `${VENDOR_DIR}/lua-${LUA_RELEASE.version}.tar.gz`;
  await sys.writeBytes(archivePath, archive);
  const untar = await sys.run(BIN.tar, ["-xzf", archivePath, "-C", VENDOR_DIR]);
  if (untar.code !== 0) throw new Error(`tar failed: ${untar.stderr.trim()}`);
  if (!(await sys.exists(`${LUA_DIR}/src/lapi.c`))) {
    throw new Error("the archive did not unpack to vendor/lua-5.2.4/src/");
  }
  await sys.remove(archivePath);
  await sys.writeText(`${LUA_DIR}/.installed`, `${LUA_RELEASE.sha256}\n`);
  lines.push("unpacked to vendor/lua-5.2.4");
  return { skipped: false, lines };
}
