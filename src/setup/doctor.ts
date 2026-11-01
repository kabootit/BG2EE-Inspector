/**
 * Doctor: check every requirement in docs/requirements.md.
 *
 * Read-only towards the game, the user folder and the repo. The one thing it
 * writes is a throwaway test library under build/doctor/, to prove the toolchain
 * can produce an ad-hoc-signed arm64 dylib. It never runs WeiDU or the game:
 * binaries are identified by SHA-256 and Mach-O header instead.
 */
import {
  BALDUR_LUA,
  BIN,
  BUILD_DIR,
  GAME_APP,
  GAME_BINARY,
  KNOWN_GAME_BUILDS,
  KNOWN_WEIDU,
  LUA_DIR,
  REQUIRED_ENTITLEMENTS,
  WEIDU_BINARY,
  WEIDU_OVERRIDE,
  WEIDU_RELEASE,
} from "../shared/config.ts";
import { denoVersionProblem } from "../shared/deno_version.ts";
import { sha256Hex } from "../shared/sha256.ts";
import { machoArchs } from "../re/macho.ts";
import type { System } from "./system.ts";

export type Status = "ok" | "warn" | "fail";

/** Who needs a requirement: failing a players' check fails doctor; the rest only warn. */
export type Audience = "players" | "contributors" | "optional";

export interface Check {
  name: string;
  audience: Audience;
  status: Status;
  detail: string;
}

const check = (name: string, audience: Audience, status: Status, detail: string): Check => ({
  name,
  audience,
  status,
  detail,
});

export function checkPlatform(sys: System): Check {
  return sys.os === "darwin" && sys.arch === "aarch64"
    ? check("Mac with Apple Silicon", "players", "ok", `${sys.os} ${sys.arch}`)
    : check(
      "Mac with Apple Silicon",
      "players",
      "fail",
      `${sys.os} ${sys.arch}: the game must run natively on arm64 (Intel Macs are unsupported)`,
    );
}

export async function checkMacOS(sys: System): Promise<Check> {
  const r = await sys.run(BIN.swVers, ["-productVersion"]);
  return r.code === 0
    ? check("macOS", "players", "ok", `${r.stdout.trim()} (tested on 14.6.1)`)
    : check("macOS", "players", "warn", "could not read the version with sw_vers");
}

export function checkDeno(sys: System): Check {
  const problem = denoVersionProblem(sys.denoVersion);
  return problem === null
    ? check("Deno", "players", "ok", sys.denoVersion)
    : check("Deno", "players", "fail", problem);
}

/** The game executable: present, a supported build, and carrying both entitlements. */
export async function checkGame(sys: System): Promise<Check[]> {
  const bytes = await sys.readBytes(GAME_BINARY);
  if (bytes === null) {
    return [
      check(
        "BG2:EE game",
        "players",
        "fail",
        `not found or not readable at ${GAME_BINARY}; set BG2EE_GAME_DIR or BG2EE_BINARY`,
      ),
    ];
  }
  const out: Check[] = [];
  const sha = await sha256Hex(bytes);
  const known = KNOWN_GAME_BUILDS.find((b) => b.sha256 === sha);
  const plist = await sys.run(BIN.plutil, [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    `${GAME_APP}/Contents/Info.plist`,
  ]);
  const version = plist.code === 0 ? plist.stdout.trim() : "unknown version";
  out.push(
    known
      ? check(
        "BG2:EE game",
        "players",
        "ok",
        `${known.version} ${known.store}, SHA-256 ${sha.slice(0, 12)}…`,
      )
      : check(
        "BG2:EE game",
        "players",
        "fail",
        `SHA-256 ${sha} is not a supported build (app bundle says ${version}; supported: ${
          KNOWN_GAME_BUILDS.map((b) => `${b.version} ${b.store}`).join(", ")
        })`,
      ),
  );
  const archs = machoArchs(bytes);
  out.push(
    archs.includes("arm64")
      ? check("Game architecture", "players", "ok", archs.join(" + "))
      : check(
        "Game architecture",
        "players",
        "fail",
        `${archs.join(" + ") || "not Mach-O"}: no arm64 slice`,
      ),
  );
  // Read from the executable being checked, not the bundle, so a BG2EE_BINARY override is judged
  // on its own signature.
  const ent = await sys.run(BIN.codesign, ["-d", "--entitlements", ":-", GAME_BINARY]);
  const missing = REQUIRED_ENTITLEMENTS.filter((e) => !hasTrueEntitlement(ent.stdout, e));
  out.push(
    missing.length === 0
      ? check(
        "Game entitlements",
        "players",
        "ok",
        "allow-dyld-environment-variables, disable-library-validation",
      )
      : check("Game entitlements", "players", "fail", `missing: ${missing.join(", ")}`),
  );
  return out;
}

/** Whether an entitlements plist (XML) sets `key` to true. */
export function hasTrueEntitlement(plist: string, key: string): boolean {
  return new RegExp(`<key>${key.replace(/\./g, "\\.")}</key>\\s*<true\\s*/>`).test(plist);
}

/** The compiler and binary tools, resolved through xcrun rather than the /usr/bin stubs. */
export async function checkToolchain(sys: System): Promise<Check[]> {
  const dir = await sys.run(BIN.xcodeSelect, ["-p"]);
  if (dir.code !== 0) {
    return [
      check(
        "Command Line Tools or Xcode",
        "players",
        "fail",
        "none selected; install with xcode-select --install",
      ),
    ];
  }
  const out = [check("Command Line Tools or Xcode", "players", "ok", dir.stdout.trim())];
  const clang = await sys.run(BIN.xcrun, ["clang", "--version"]);
  out.push(
    clang.code === 0
      ? check("clang", "players", "ok", clang.stdout.split("\n")[0].trim())
      : check("clang", "players", "fail", "xcrun cannot find clang"),
  );
  for (const tool of ["llvm-objdump", "otool"]) {
    const r = await sys.run(BIN.xcrun, ["-f", tool]);
    out.push(
      r.code === 0
        ? check(tool, "contributors", "ok", r.stdout.trim())
        : check(tool, "contributors", "warn", "not found through xcrun"),
    );
  }
  return out;
}

const SMOKE_SOURCE = `#include <mach/mach.h>
#include <mach/mach_vm.h>
__attribute__((constructor)) static void smoke(void) {
  char b[4]; mach_vm_size_t n = 0;
  mach_vm_read_overwrite(mach_task_self(), (mach_vm_address_t)b, 4, (mach_vm_address_t)b, &n);
}
`;

/** Build a throwaway dylib with the planned APIs and confirm it is arm64 and ad-hoc signed. */
export async function checkBuild(sys: System): Promise<Check> {
  const name = "Test build (arm64 dylib, ad-hoc signed)";
  const dir = `${BUILD_DIR}/doctor`;
  await sys.makeDir(dir);
  await sys.writeText(`${dir}/smoke.c`, SMOKE_SOURCE);
  const built = await sys.run(BIN.xcrun, [
    "clang",
    "-arch",
    "arm64",
    "-dynamiclib",
    "-O2",
    "-o",
    `${dir}/smoke.dylib`,
    `${dir}/smoke.c`,
  ]);
  if (built.code !== 0) {
    return check(name, "players", "fail", `clang failed: ${built.stderr.trim()}`);
  }
  const bytes = await sys.readBytes(`${dir}/smoke.dylib`);
  const archs = bytes ? machoArchs(bytes) : [];
  const sig = await sys.run(BIN.codesign, ["-dv", `${dir}/smoke.dylib`]);
  const adhoc = /Signature=adhoc/.test(sig.stderr + sig.stdout);
  if (!archs.includes("arm64")) {
    return check(name, "players", "fail", `built ${archs.join(", ") || "nothing"}`);
  }
  if (!adhoc) return check(name, "players", "fail", "the linker did not ad-hoc sign the library");
  return check(name, "players", "ok", "arm64, Signature=adhoc");
}

/** WeiDU, identified by SHA-256 and Mach-O header, never by running it. */
export async function checkWeidu(sys: System): Promise<Check> {
  const name = "WeiDU";
  const path = WEIDU_OVERRIDE ?? WEIDU_BINARY;
  const source = WEIDU_OVERRIDE ? "BG2EE_WEIDU" : "vendor/weidu";
  const bytes = await sys.readBytes(path);
  if (bytes === null) {
    return check(name, "players", "fail", `not found (${source}); run deno task setup-weidu`);
  }
  const sha = await sha256Hex(bytes);
  const known = KNOWN_WEIDU.find((w) => w.sha256 === sha);
  const archs = machoArchs(bytes);
  if (!known) {
    return check(
      name,
      "players",
      "warn",
      `${source}: unknown build (SHA-256 ${sha}), ${archs.join(" + ")}`,
    );
  }
  if (known.version !== WEIDU_RELEASE.version || !archs.includes("arm64")) {
    return check(
      name,
      "players",
      "warn",
      `${source}: v${known.version} ${known.arch} (${known.note}); the pinned release is v${WEIDU_RELEASE.version} arm64, from deno task setup-weidu`,
    );
  }
  return check(name, "players", "ok", `${source}: v${known.version} ${known.arch}`);
}

export async function checkLuaSource(sys: System): Promise<Check> {
  return (await sys.exists(`${LUA_DIR}/src/lapi.c`))
    ? check("Lua 5.2.4 source", "contributors", "ok", "vendor/lua-5.2.4")
    : check(
      "Lua 5.2.4 source",
      "contributors",
      "warn",
      "missing; contributors run deno task setup-dev",
    );
}

/** Debug Mode enables the Ctrl+Space console for the A7X console commands. Read-only. */
export async function checkDebugMode(sys: System): Promise<Check> {
  const name = "Debug Mode (Baldur.lua)";
  const text = await sys.readText(BALDUR_LUA);
  if (text === null) {
    return check(name, "optional", "warn", "Baldur.lua not found; start the game once");
  }
  return /'Program Options'\s*,\s*'Debug Mode'\s*,\s*'1'/.test(text)
    ? check(name, "optional", "ok", "on: console commands available")
    : check(
      name,
      "optional",
      "warn",
      "off: the hotkey works, console commands need it (edit with the game closed)",
    );
}

/** Every check, in the order docs/requirements.md lists them. */
export async function runDoctor(sys: System): Promise<Check[]> {
  return [
    checkPlatform(sys),
    await checkMacOS(sys),
    checkDeno(sys),
    ...await checkGame(sys),
    ...await checkToolchain(sys),
    await checkBuild(sys),
    await checkWeidu(sys),
    await checkLuaSource(sys),
    await checkDebugMode(sys),
  ];
}

/** Doctor fails only when a players' requirement fails. */
export function doctorPassed(checks: Check[]): boolean {
  return !checks.some((c) => c.status === "fail");
}
