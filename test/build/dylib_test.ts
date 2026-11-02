import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { buildDylib, compileArgs, verifyDylib } from "../../src/build/dylib.ts";
import { BIN } from "../../src/shared/config.ts";
import { ARM64, fakeSystem, thinMacho, X86_64 } from "../setup/fake_system.ts";

const ADHOC = { code: 0, stdout: "", stderr: "Signature=adhoc\n" };

Deno.test("compile arguments build an arm64 dylib with warnings as errors", () => {
  const args = compileArgs("a.c", "a.dylib");
  for (const flag of ["-dynamiclib", "-Wall", "-Wextra", "-Werror", "-std=c17"]) {
    strictEqual(args.includes(flag), true, flag);
  }
  deepStrictEqual(args.slice(args.indexOf("-arch"), args.indexOf("-arch") + 2), ["-arch", "arm64"]);
});

Deno.test("the library links OpenGL, to call the real glClear it interposes", () => {
  const args = compileArgs("a.c", "a.dylib");
  deepStrictEqual(args.slice(args.indexOf("-framework"), args.indexOf("-framework") + 2), [
    "-framework",
    "OpenGL",
  ]);
});

Deno.test("a clang failure is reported with its output", async () => {
  const sys = fakeSystem(
    {},
    (cmd) => cmd === BIN.xcrun ? { code: 1, stdout: "", stderr: "a.c:1: error" } : undefined,
  );
  const result = await buildDylib(sys, "a.c", "a.dylib");
  strictEqual(result.ok, false);
  strictEqual(result.detail.includes("a.c:1: error"), true);
});

Deno.test("the built library must be arm64 and ad-hoc signed", async () => {
  const signed = (cmd: string) => (cmd === BIN.codesign ? ADHOC : undefined);
  strictEqual(
    (await verifyDylib(fakeSystem({ "a.dylib": thinMacho(ARM64) }, signed), "a.dylib")).ok,
    true,
  );
  strictEqual(
    (await verifyDylib(fakeSystem({ "a.dylib": thinMacho(X86_64) }, signed), "a.dylib")).ok,
    false,
  );
  strictEqual(
    (await verifyDylib(fakeSystem({ "a.dylib": thinMacho(ARM64) }), "a.dylib")).ok,
    false,
  );
  strictEqual((await verifyDylib(fakeSystem({}, signed), "a.dylib")).ok, false);
});
