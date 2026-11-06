/**
 * Reading native/builds.h and checking it against a game binary.
 *
 * builds.h is written by hand (docs/re-notes.md), and the library checks every
 * site at load, so a wrong entry only disables it in the game. This module lets
 * a test find the same mistake earlier, against the installed binary: the same
 * FNV-1a hash over the same bytes, computed independently of the C code.
 */
import { archSlice, imageUuid, segment } from "./macho.ts";

/** A range of the game's code and the hash its bytes must have (struct a7x_site). */
export type Site = { name: string; offset: number; size: number; fnv1a: bigint };

/** One entry of A7X_BUILDS, as far as the check needs it. */
export type Build = { name: string; uuid: string; sites: Site[] };

const SITE = /\{"([^"]+)", (0x[0-9a-f]+), (0x[0-9a-f]+), (0x[0-9a-f]{16})ULL\}/g;
const UUID = /\.uuid = \{([^}]*)\}/;

/** Every build in builds.h, split at each `.name = "…"`, with its UUID and sites in order. */
export function parseBuilds(text: string): Build[] {
  return text.split(/\.name = "/).slice(1).map((block) => {
    const bytes = (block.match(UUID)?.[1] ?? "").split(",").map((b) => b.trim()).filter(Boolean);
    const hex = bytes.map((b) => Number(b).toString(16).padStart(2, "0").toUpperCase()).join("");
    return {
      name: block.slice(0, block.indexOf('"')),
      uuid: [0, 8, 12, 16, 20].map((at, i, all) => hex.slice(at, all[i + 1] ?? 32)).join("-"),
      sites: [...block.matchAll(SITE)].map(([, name, offset, size, fnv1a]) => ({
        name,
        offset: Number(offset),
        size: Number(size),
        fnv1a: BigInt(fnv1a),
      })),
    };
  });
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/** FNV-1a, 64-bit: the hash native/a7x.c computes over each site. */
export function fnv1a64(bytes: Uint8Array): bigint {
  return bytes.reduce((h, b) => ((h ^ BigInt(b)) * FNV_PRIME) & MASK_64, FNV_OFFSET);
}

/** Why a build entry does not fit a binary; empty when every check passes. */
export function checkBuild(binary: Uint8Array, build: Build): string[] {
  const slice = archSlice(binary, "arm64");
  if (!slice) return ["no arm64 slice"];
  const uuid = imageUuid(slice);
  if (uuid !== build.uuid) return [`LC_UUID is ${uuid ?? "missing"}, not ${build.uuid}`];
  // Image-relative offsets equal file offsets only when __TEXT starts the file at the image base.
  const text = segment(slice, "__TEXT");
  if (!text || text.fileoff !== 0 || text.vmaddr !== 0x100000000) {
    return ["__TEXT does not map file offset 0 to 0x100000000"];
  }
  return build.sites.flatMap((site) => {
    if (site.offset + site.size > text.filesize) return [`${site.name}: outside __TEXT`];
    const got = fnv1a64(slice.subarray(site.offset, site.offset + site.size));
    return got === site.fnv1a ? [] : [`${site.name}: hash 0x${got.toString(16)}`];
  });
}
