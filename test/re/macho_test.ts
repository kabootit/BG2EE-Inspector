import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  archSlice,
  fatEntryOffsets,
  imageUuid,
  loadCommands,
  machoArchs,
  readHeader,
  segment,
} from "../../src/re/macho.ts";
import { machoImage, universal } from "./macho_fixture.ts";
import { ARM64, fatMacho, thinMacho, X86_64 } from "../setup/fake_system.ts";

Deno.test("a thin Mach-O names its one architecture", () => {
  deepStrictEqual(machoArchs(thinMacho(ARM64)), ["arm64"]);
  deepStrictEqual(machoArchs(thinMacho(X86_64)), ["x86_64"]);
});

Deno.test("a universal binary lists every slice, in order", () => {
  deepStrictEqual(machoArchs(fatMacho([X86_64, ARM64])), ["x86_64", "arm64"]);
});

/** A fat header claiming `claimed` entries, followed by real entries for `cpuTypes` only. */
function fatWithClaimedCount(claimed: number, cpuTypes: number[]): Uint8Array {
  const bytes = fatMacho(cpuTypes);
  new DataView(bytes.buffer).setUint32(4, claimed, false);
  return bytes;
}

Deno.test("an oversized fat entry count is bounded by the file size", () => {
  // A corrupt or hostile header claiming 2^32-1 entries in a 48-byte file must not try to read
  // (or allocate for) entries that cannot exist: only the two present are returned, at once.
  const started = performance.now();
  deepStrictEqual(machoArchs(fatWithClaimedCount(0xffffffff, [X86_64, ARM64])), [
    "x86_64",
    "arm64",
  ]);
  strictEqual(performance.now() - started < 100, true);
});

Deno.test("a fat header claiming more entries than present returns only the complete ones", () => {
  deepStrictEqual(machoArchs(fatWithClaimedCount(3, [ARM64, X86_64])), ["arm64", "x86_64"]);
  deepStrictEqual(machoArchs(fatWithClaimedCount(1, [ARM64, X86_64])), ["arm64"]);
  deepStrictEqual(machoArchs(fatWithClaimedCount(0, [ARM64])), []);
});

Deno.test("readHeader classifies thin, fat and other files", () => {
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer);
  deepStrictEqual(readHeader(view(thinMacho(ARM64))), { kind: "thin", cpu: ARM64 });
  deepStrictEqual(readHeader(view(fatMacho([X86_64, ARM64]))), {
    kind: "fat",
    count: 2,
    entrySize: 20,
  });
  deepStrictEqual(readHeader(view(new Uint8Array(8))), { kind: "none" });
  deepStrictEqual(readHeader(view(new Uint8Array(4))), { kind: "none" });
});

Deno.test("fatEntryOffsets keeps only entries that fit completely", () => {
  deepStrictEqual(fatEntryOffsets(2, 20, 48), [8, 28]);
  deepStrictEqual(fatEntryOffsets(0xffffffff, 20, 48), [8, 28]);
  deepStrictEqual(fatEntryOffsets(3, 20, 47), [8]); // the second entry is one byte short
  deepStrictEqual(fatEntryOffsets(5, 32, 4), []); // shorter than the header itself
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

Deno.test("archSlice returns a thin file whole, and a fat entry's range", () => {
  const arm = machoImage();
  strictEqual(archSlice(arm, "arm64"), arm);
  strictEqual(archSlice(arm, "x86_64"), undefined);
  const fat = universal([[X86_64, new Uint8Array(40)], [ARM64, arm]]);
  deepStrictEqual(archSlice(fat, "arm64"), arm);
  strictEqual(archSlice(new Uint8Array(3), "arm64"), undefined);
});

Deno.test("archSlice treats a fat entry reaching past the file as absent", () => {
  const fat = universal([[ARM64, machoImage()]]);
  new DataView(fat.buffer).setUint32(8 + 12, fat.length, false); // size larger than what is left
  strictEqual(archSlice(fat, "arm64"), undefined);
});

Deno.test("loadCommands, imageUuid and segment read a thin image", () => {
  const image = machoImage({ uuid: Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i) });
  deepStrictEqual(loadCommands(image).map((c) => c.cmd), [0x1b, 0x19]);
  strictEqual(imageUuid(image), "A0A1A2A3-A4A5-A6A7-A8A9-AAABACADAEAF");
  deepStrictEqual(segment(image, "__TEXT"), {
    vmaddr: 0x100000000,
    vmsize: image.length,
    fileoff: 0,
    filesize: image.length,
  });
  strictEqual(segment(image, "__DATA"), undefined);
});

Deno.test("loadCommands is bounded by the bytes, not by ncmds", () => {
  const image = machoImage();
  new DataView(image.buffer).setUint32(16, 0xffffffff, true); // claims 2^32-1 commands
  deepStrictEqual(loadCommands(image).map((c) => c.cmd), [0x1b, 0x19]);
  new DataView(image.buffer).setUint32(36, 4, true); // LC_UUID shorter than a command header
  deepStrictEqual(loadCommands(image), []);
  strictEqual(imageUuid(image), undefined);
  deepStrictEqual(loadCommands(thinMacho(ARM64).subarray(0, 16)), []);
});
