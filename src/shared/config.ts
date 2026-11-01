/**
 * Paths, pinned downloads and known builds.
 *
 * Every path can be overridden by an environment variable, and paths are derived
 * from HOME rather than written out, so no home directory appears in the repo.
 * Tasks that import this module need `--allow-env` for every name in ENV_NAMES.
 */
import { ROOT } from "./repo_files.ts";

/** Environment variables this module reads; tasks list exactly these in --allow-env. */
export const ENV_NAMES = [
  "HOME",
  "BG2EE_GAME_DIR",
  "BG2EE_BINARY",
  "BG2EE_USER_DIR",
  "BG2EE_WEIDU",
];

const env = (name: string) => Deno.env.get(name) || undefined;
const HOME = env("HOME") ?? "";

/** The Steam install folder. */
export const GAME_DIR = env("BG2EE_GAME_DIR") ??
  `${HOME}/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition`;

export const GAME_APP = `${GAME_DIR}/BaldursGateIIEnhancedEdition.app`;

export const GAME_BINARY = env("BG2EE_BINARY") ??
  `${GAME_APP}/Contents/MacOS/BaldursGateIIEnhancedEdition`;

/** The game's user folder: saves and Baldur.lua. */
export const USER_DIR = env("BG2EE_USER_DIR") ??
  `${HOME}/Documents/Baldur's Gate II - Enhanced Edition`;

export const BALDUR_LUA = `${USER_DIR}/Baldur.lua`;

/** Downloads (gitignored). */
export const VENDOR_DIR = `${ROOT}vendor`;
export const WEIDU_DIR = `${VENDOR_DIR}/weidu`;
export const WEIDU_BINARY = `${WEIDU_DIR}/weidu`;
export const LUA_DIR = `${VENDOR_DIR}/lua-5.2.4`;

/** Build output (gitignored). */
export const BUILD_DIR = `${ROOT}build`;

/** The inspector's native library: its one C source and the built dylib. */
export const DYLIB_SOURCE = `${ROOT}native/a7x.c`;
export const DYLIB_PATH = `${BUILD_DIR}/a7x.dylib`;

/**
 * System binaries, by absolute path so a directory earlier in PATH cannot stand in for them. The
 * same paths are the --allow-run lists in deno.json.
 */
export const BIN = {
  codesign: "/usr/bin/codesign",
  ditto: "/usr/bin/ditto",
  plutil: "/usr/bin/plutil",
  swVers: "/usr/bin/sw_vers",
  tar: "/usr/bin/tar",
  xattr: "/usr/bin/xattr",
  xcodeSelect: "/usr/bin/xcode-select",
  xcrun: "/usr/bin/xcrun",
};

/** An explicit WeiDU binary, overriding vendor/weidu. Still identified by SHA-256. */
export const WEIDU_OVERRIDE = env("BG2EE_WEIDU");

export interface GameBuild {
  sha256: string;
  version: string;
  store: string;
}

/** Game executables this project supports, by SHA-256 of the executable. */
export const KNOWN_GAME_BUILDS: GameBuild[] = [
  {
    sha256: "3fa9b60aea923cdf1003da9f139a87ab08cfc9fcf0784d944d4938d309e8d8d8",
    version: "2.7.3",
    store: "Steam",
  },
];

/** The entitlements that make loading the inspector's library possible (ADR-0001). */
export const REQUIRED_ENTITLEMENTS = [
  "com.apple.security.cs.allow-dyld-environment-variables",
  "com.apple.security.cs.disable-library-validation",
];

export interface Download {
  version: string;
  url: string;
  /** SHA-256 of the downloaded archive, as published upstream. */
  sha256: string;
  /** Where the checksum was published, so it can be re-checked. */
  checksumSource: string;
}

export const WEIDU_RELEASE: Download = {
  version: "251.00",
  url: "https://github.com/WeiDUorg/weidu/releases/download/v251.00/WeiDU-Mac-ARM-251.zip",
  sha256: "ba050f5a02f56865667adee7ec1c525a34313928182301081b5ec278c29096be",
  checksumSource: "GitHub release asset digest, WeiDUorg/weidu v251.00",
};

export const LUA_RELEASE: Download = {
  version: "5.2.4",
  url: "https://www.lua.org/ftp/lua-5.2.4.tar.gz",
  sha256: "b9e2e4aad6789b3b63a056d442f7b39f0ecfca3ae0f1fc0ae4e9614401b69f4b",
  checksumSource: "https://www.lua.org/ftp/ (sha256 column)",
};

export interface KnownWeidu {
  sha256: string;
  version: string;
  arch: string;
  note: string;
}

/** WeiDU binaries doctor can name without running them, by SHA-256 of the binary. */
export const KNOWN_WEIDU: KnownWeidu[] = [
  {
    sha256: "7cb0bcff7410a669a5aeddaaba5f28703856f446cb9dd514953fc78e3e528768",
    version: "251.00",
    arch: "arm64",
    note: "the pinned release, WeiDU-Mac/weidu in WeiDU-Mac-ARM-251.zip",
  },
  {
    sha256: "370ff69b64f40fe56aa1c30000258c764ee0735780f944be99ba0a512fcd6e02",
    version: "249.00",
    arch: "x86_64",
    note: "shipped as setup-* by older mods; needs Rosetta",
  },
];
