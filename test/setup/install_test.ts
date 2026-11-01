import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { installWeidu } from "../../src/setup/install.ts";
import { BIN, WEIDU_BINARY, WEIDU_DIR, WEIDU_RELEASE } from "../../src/shared/config.ts";
import { sha256Hex } from "../../src/shared/sha256.ts";
import { ARM64, fakeSystem, thinMacho, X86_64 } from "./fake_system.ts";

const failingFetch = () => Promise.reject(new Error("no network in tests"));

Deno.test("an existing matching install is left alone, with no download", async () => {
  const sys = fakeSystem({
    [`${WEIDU_DIR}/.installed`]: `${WEIDU_RELEASE.sha256}\n`,
    [WEIDU_BINARY]: thinMacho(ARM64),
  });
  const result = await installWeidu(sys, failingFetch);
  strictEqual(result.skipped, true);
  deepStrictEqual(sys.ran, []);
});

Deno.test("a checksum mismatch writes nothing", async () => {
  const sys = fakeSystem();
  const wrong = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  await rejects(installWeidu(sys, wrong), /SHA-256 mismatch/);
  strictEqual(sys.files.size, 0);
  deepStrictEqual(sys.ran, []);
});

Deno.test("an x86_64 binary in the archive is refused", async () => {
  // The pinned checksum is swapped for this test body's, so the download passes and the unpack
  // stage is reached, where the fake ditto "extracts" an x86_64 weidu.
  const sys = fakeSystem({}, (cmd, args) => {
    if (cmd === BIN.ditto) {
      sys.files.set(`${args[3]}/WeiDU-Mac/weidu`, thinMacho(X86_64));
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "" };
  });
  const original = WEIDU_RELEASE.sha256;
  const body = new Uint8Array([7]);
  WEIDU_RELEASE.sha256 = await sha256Hex(body);
  try {
    await rejects(
      installWeidu(sys, () => Promise.resolve(new Response(new Uint8Array(body)))),
      /not arm64/,
    );
    strictEqual(sys.files.has(WEIDU_BINARY), false);
  } finally {
    WEIDU_RELEASE.sha256 = original;
  }
});
