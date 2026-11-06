import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { type Build, checkBuild, fnv1a64, parseBuilds } from "../../src/re/builds.ts";
import { GAME_BINARY } from "../../src/shared/config.ts";
import { IMAGE_CODE_AT, machoImage } from "./macho_fixture.ts";

const BUILDS_H = await Deno.readTextFile("native/builds.h");

Deno.test("fnv1a64 matches the published FNV-1a 64-bit vectors", () => {
  const text = (s: string) => new TextEncoder().encode(s);
  strictEqual(fnv1a64(text("")), 0xcbf29ce484222325n);
  strictEqual(fnv1a64(text("a")), 0xaf63dc4c8601ec8cn);
  strictEqual(fnv1a64(text("foobar")), 0x85944171f73967e8n);
});

Deno.test("builds.h parses to one build with a site per engine function and two anchors", () => {
  const builds = parseBuilds(BUILDS_H);
  deepStrictEqual(builds.map((b) => [b.name, b.uuid]), [
    ["2.7.3 arm64", "54799B31-C2BF-36E9-9685-65F8EC3CA58F"],
  ]);
  const enumNames = [...BUILDS_H.matchAll(/^\s+A7X_FN_(lua_\w+),$/gm)].map((m) => m[1]);
  strictEqual(enumNames.length, 11);
  const names = builds[0].sites.map((s) => s.name);
  deepStrictEqual(names.slice(0, enumNames.length), enumNames);
  strictEqual(names.length, enumNames.length + 2);
});

/** A one-build entry whose single site covers `size` bytes of the fixture's code. */
function fixtureBuild(image: Uint8Array, size: number, uuid: string): Build {
  const code = image.subarray(IMAGE_CODE_AT, IMAGE_CODE_AT + size);
  return {
    name: "fixture",
    uuid,
    sites: [{ name: "f", offset: IMAGE_CODE_AT, size, fnv1a: fnv1a64(code) }],
  };
}

const FIXTURE_UUID = "01020304-0506-0708-090A-0B0C0D0E0F10";

Deno.test("checkBuild passes a matching site and names one with a flipped byte", () => {
  const image = machoImage({ code: Uint8Array.from({ length: 64 }, (_, i) => i * 7) });
  const build = fixtureBuild(image, 32, FIXTURE_UUID);
  deepStrictEqual(checkBuild(image, build), []);
  image[IMAGE_CODE_AT + 31] ^= 0x01;
  const [finding, ...rest] = checkBuild(image, build);
  strictEqual(finding.startsWith("f: hash 0x"), true);
  deepStrictEqual(rest, []);
});

Deno.test("checkBuild refuses another build, an unusual __TEXT, and a site past it", () => {
  const image = machoImage();
  const build = fixtureBuild(image, 16, FIXTURE_UUID);
  deepStrictEqual(checkBuild(image, { ...build, uuid: "00000000-0000-0000-0000-000000000000" }), [
    `LC_UUID is ${FIXTURE_UUID}, not 00000000-0000-0000-0000-000000000000`,
  ]);
  deepStrictEqual(checkBuild(machoImage({ textFileoff: 4096 }), build), [
    "__TEXT does not map file offset 0 to 0x100000000",
  ]);
  const past = { ...build, sites: [{ ...build.sites[0], offset: image.length - 8 }] };
  deepStrictEqual(checkBuild(image, past), ["f: outside __TEXT"]);
  deepStrictEqual(checkBuild(new Uint8Array(8), build), ["no arm64 slice"]);
});

Deno.test("every builds.h site matches the installed game binary", async () => {
  let binary: Uint8Array;
  try {
    binary = await Deno.readFile(GAME_BINARY);
  } catch (error) {
    // Not installed on this machine. A permission error is not skipped: with BG2EE_BINARY outside
    // the test task's read scope, the check would otherwise pass without having run.
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  deepStrictEqual(checkBuild(binary, parseBuilds(BUILDS_H)[0]), []);
});
