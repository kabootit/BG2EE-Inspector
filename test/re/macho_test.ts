import { deepStrictEqual } from "node:assert/strict";
import { machoArchs } from "../../src/re/macho.ts";
import { ARM64, fatMacho, thinMacho, X86_64 } from "../setup/fake_system.ts";

Deno.test("a thin Mach-O names its one architecture", () => {
  deepStrictEqual(machoArchs(thinMacho(ARM64)), ["arm64"]);
  deepStrictEqual(machoArchs(thinMacho(X86_64)), ["x86_64"]);
});

Deno.test("a universal binary lists every slice, in order", () => {
  deepStrictEqual(machoArchs(fatMacho([X86_64, ARM64])), ["x86_64", "arm64"]);
});

Deno.test("anything else has no architectures", () => {
  deepStrictEqual(machoArchs(new TextEncoder().encode("#!/bin/sh\n")), []);
  deepStrictEqual(machoArchs(new Uint8Array(3)), []);
});

Deno.test("the pinned WeiDU binary, when installed, is arm64", async () => {
  try {
    deepStrictEqual(machoArchs(await Deno.readFile("vendor/weidu/weidu")), ["arm64"]);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error; // not installed on this machine
  }
});
