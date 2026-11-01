import { deepStrictEqual, rejects } from "node:assert/strict";
import { downloadVerified } from "../../src/setup/download.ts";
import type { Download } from "../../src/shared/config.ts";

const ABC = new TextEncoder().encode("abc");
const release = (sha256: string): Download => ({
  version: "1",
  url: "https://example.org/a.zip",
  sha256,
  checksumSource: "test",
});
const serve = (body: Uint8Array, status = 200) => () =>
  Promise.resolve(new Response(new Uint8Array(body), { status }));

Deno.test("a matching checksum returns the bytes", async () => {
  const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  deepStrictEqual(await downloadVerified(release(sha), serve(ABC)), ABC);
});

Deno.test("a checksum mismatch is refused", async () => {
  await rejects(downloadVerified(release("0".repeat(64)), serve(ABC)), /SHA-256 mismatch/);
});

Deno.test("an HTTP error is refused", async () => {
  await rejects(downloadVerified(release("0".repeat(64)), serve(ABC, 404)), /HTTP 404/);
});
