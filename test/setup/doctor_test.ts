import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  checkDebugMode,
  checkDeno,
  checkGame,
  checkLuaSource,
  checkPlatform,
  checkWeidu,
  doctorPassed,
  hasTrueEntitlement,
} from "../../src/setup/doctor.ts";
import { BALDUR_LUA, BIN, GAME_BINARY, LUA_DIR, WEIDU_BINARY } from "../../src/shared/config.ts";
import { ARM64, fakeSystem, fatMacho, thinMacho, X86_64 } from "./fake_system.ts";

const ENTITLEMENTS = `<plist><dict>
<key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
</dict></plist>`;

const statuses = (checks: Array<{ status: string }>) => checks.map((c) => c.status);

Deno.test("platform: only arm64 macOS passes", () => {
  strictEqual(checkPlatform(fakeSystem()).status, "ok");
  strictEqual(checkPlatform(fakeSystem({}, undefined, { arch: "x86_64" })).status, "fail");
});

Deno.test("Deno: older than the minimum fails", () => {
  strictEqual(checkDeno(fakeSystem()).status, "ok");
  strictEqual(checkDeno(fakeSystem({}, undefined, { denoVersion: "2.8.1" })).status, "fail");
});

Deno.test("entitlements must be present and true", () => {
  strictEqual(
    hasTrueEntitlement(ENTITLEMENTS, "com.apple.security.cs.disable-library-validation"),
    true,
  );
  strictEqual(
    hasTrueEntitlement(
      ENTITLEMENTS.replace(/<true\/>/g, "<false/>"),
      "com.apple.security.cs.disable-library-validation",
    ),
    false,
  );
});

Deno.test("game: an unknown build and missing entitlements fail; a missing game fails", async () => {
  const answer = (stdout: string) => (cmd: string) =>
    cmd === BIN.codesign
      ? { code: 0, stdout, stderr: "" }
      : { code: 0, stdout: "2.7.3\n", stderr: "" };
  const unknown = await checkGame(
    fakeSystem({ [GAME_BINARY]: fatMacho([X86_64, ARM64]) }, answer(ENTITLEMENTS)),
  );
  deepStrictEqual(statuses(unknown), ["fail", "ok", "ok"]);
  const noEnt = await checkGame(
    fakeSystem({ [GAME_BINARY]: thinMacho(X86_64) }, answer("<plist/>")),
  );
  deepStrictEqual(statuses(noEnt), ["fail", "fail", "fail"]);
  deepStrictEqual(statuses(await checkGame(fakeSystem())), ["fail"]);
});

Deno.test("WeiDU: missing fails, unknown or old warns", async () => {
  strictEqual((await checkWeidu(fakeSystem())).status, "fail");
  strictEqual((await checkWeidu(fakeSystem({ [WEIDU_BINARY]: thinMacho(ARM64) }))).status, "warn");
});

Deno.test("Lua source is a contributor warning, never a failure", async () => {
  strictEqual((await checkLuaSource(fakeSystem())).status, "warn");
  strictEqual((await checkLuaSource(fakeSystem({ [`${LUA_DIR}/src/lapi.c`]: "" }))).status, "ok");
});

Deno.test("Debug Mode is read from Baldur.lua", async () => {
  const on = "SetPrivateProfileString('Program Options','Debug Mode','1')";
  strictEqual((await checkDebugMode(fakeSystem({ [BALDUR_LUA]: on }))).status, "ok");
  strictEqual(
    (await checkDebugMode(fakeSystem({ [BALDUR_LUA]: on.replace("'1'", "'0'") }))).status,
    "warn",
  );
  strictEqual((await checkDebugMode(fakeSystem())).status, "warn");
});

Deno.test("doctor fails only on a failed check", () => {
  const c = (status: "ok" | "warn" | "fail") => ({
    name: "x",
    audience: "players" as const,
    status,
    detail: "",
  });
  strictEqual(doctorPassed([c("ok"), c("warn")]), true);
  strictEqual(doctorPassed([c("ok"), c("fail")]), false);
});
