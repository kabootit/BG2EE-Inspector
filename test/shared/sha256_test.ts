import { strictEqual } from "node:assert/strict";
import { sha256Hex } from "../../src/shared/sha256.ts";

Deno.test("sha256Hex matches the standard test vector", async () => {
  strictEqual(
    await sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
