/**
 * `deno task re <command>`: the reverse-engineering tools behind docs/re-notes.md, run on the
 * installed game's arm64 slice. Addresses may be given image-relative (0x5499cc) or absolute
 * (0x1005499cc); output uses image-relative offsets, as native/builds.h does.
 *
 *   re starts [from] [to]          function starts, from LC_FUNCTION_STARTS
 *   re xrefs <string>              code that loads the address of a C string (ADRP + ADD/LDR)
 *   re annotate <start> [end]      disassembly with strings and known engine calls named
 *   re stats <getter>              a GetAtOffset-style stat table: id, offset, width, signedness
 *   re compare <symbol> <start> [end]   a game function against stock lapi.c built at -O2
 *   re hash <start> [size]         a builds.h site line: offset, size and FNV-1a hash
 *
 * A range's end defaults to the next function start. Writes only to build/re/.
 */
import { decodeStatGetter, referencesTo } from "../re/arm64.ts";
import { fnv1a64, parseBuilds } from "../re/builds.ts";
import { archSlice, cstringAt, functionStarts, section, segment } from "../re/macho.ts";
import {
  annotate,
  differingLines,
  normalize,
  parseObjdump,
  rangeArgs,
  symbolArgs,
} from "../re/objdump.ts";
import { realSystem } from "../setup/system.ts";
import { BIN, BUILD_DIR, GAME_BINARY, LUA_DIR } from "../shared/config.ts";
import { readRepoFile } from "../shared/repo_files.ts";
import { runTask } from "../shared/task.ts";

const IMAGE_BASE = 0x100000000;
const RE_DIR = `${BUILD_DIR}/re`;
const SLICE_PATH = `${RE_DIR}/game-arm64`;
const REFERENCE_PATH = `${RE_DIR}/lapi.o`;

const USAGE =
  "usage: deno task re starts|xrefs|annotate|stats|compare|hash … (see src/tasks/re.ts)";

const hex = (n: number) => `0x${n.toString(16)}`;
const absolute = (arg: string) => {
  const n = Number(arg);
  return n < IMAGE_BASE ? IMAGE_BASE + n : n;
};

await runTask(async () => {
  const [command, ...args] = Deno.args;
  const bytes = await realSystem.readBytes(GAME_BINARY);
  const slice = bytes && archSlice(bytes, "arm64");
  const text = slice && section(slice, "__TEXT", "__text");
  if (!slice || !text || segment(slice, "__TEXT")?.vmaddr !== IMAGE_BASE) {
    console.error(`re: no arm64 slice with __TEXT at ${hex(IMAGE_BASE)} in ${GAME_BINARY}`);
    return 1;
  }
  const read = (addr: number, n: number) =>
    slice.subarray(addr - IMAGE_BASE, addr - IMAGE_BASE + n);
  const starts = functionStarts(slice);
  const endOf = (start: number) => starts.find((s) => s > start) ?? start + 4;

  // Disassembly needs the slice as a file: objdump ignores address ranges on a universal binary.
  // Written on every run, so a game update never leaves a stale copy behind.
  const objdump = async (argv: string[]) => {
    await realSystem.makeDir(RE_DIR);
    await realSystem.writeBytes(SLICE_PATH, slice);
    const out = await realSystem.run(BIN.xcrun, argv);
    if (out.code !== 0) throw new Error(`llvm-objdump failed: ${out.stderr.trim()}`);
    return parseObjdump(out.stdout);
  };

  switch (command) {
    case "starts": {
      const [from, to] = [absolute(args[0] ?? "0"), absolute(args[1] ?? hex(2 ** 40))];
      for (const s of starts.filter((s) => s >= from && s < to)) console.log(hex(s - IMAGE_BASE));
      return 0;
    }
    case "xrefs": {
      if (!args[0]) break;
      const target = new TextEncoder().encode(`${args[0]}\0`);
      const cs = section(slice, "__TEXT", "__cstring")!;
      const hits: number[] = [];
      for (let at = cs.offset; at < cs.offset + cs.size;) {
        const i = slice.indexOf(target[0], at);
        if (i < 0 || i >= cs.offset + cs.size) break;
        // Not only at string starts: the linker merges a string into the tail of a longer one.
        if (target.every((b, k) => slice[i + k] === b)) hits.push(cs.addr + i - cs.offset);
        at = i + 1;
      }
      const code = { bytes: slice.subarray(text.offset, text.offset + text.size), addr: text.addr };
      for (const s of hits) {
        const refs = referencesTo(code, s).map((r) => hex(r - IMAGE_BASE));
        console.log(
          `${JSON.stringify(args[0])} at ${hex(s - IMAGE_BASE)}: ${refs.join(" ") || "-"}`,
        );
      }
      if (hits.length === 0) console.log(`${JSON.stringify(args[0])}: not in __cstring`);
      return 0;
    }
    case "annotate": {
      if (!args[0]) break;
      const start = absolute(args[0]);
      const end = args[1] ? absolute(args[1]) : endOf(start);
      const names = new Map(
        parseBuilds(await readRepoFile("native/builds.h"))[0].sites
          .map((s) => [IMAGE_BASE + s.offset, s.name] as const),
      );
      const lines = await objdump(rangeArgs(SLICE_PATH, start, end));
      const code = { bytes: read(start, end - start), addr: start };
      for (const line of annotate(lines, code, (a) => cstringAt(slice, a), names)) {
        console.log(line);
      }
      return 0;
    }
    case "stats": {
      if (!args[0]) break;
      for (const f of decodeStatGetter(read, absolute(args[0]))) {
        console.log(
          f.kind === "load"
            ? `${f.id}\t+${hex(f.offset)}\t${f.signed ? "i" : "u"}${f.size * 8}`
            : `${f.id}\tcomputed (${hex(f.word >>> 0)})`,
        );
      }
      return 0;
    }
    case "compare": {
      if (!args[0] || !args[1]) break;
      const start = absolute(args[1]);
      const end = args[2] ? absolute(args[2]) : endOf(start);
      await realSystem.makeDir(RE_DIR);
      const built = await realSystem.run(BIN.xcrun, [
        "clang",
        "-arch",
        "arm64",
        "-O2",
        "-c",
        `${LUA_DIR}/src/lapi.c`,
        "-o",
        REFERENCE_PATH,
      ]);
      if (built.code !== 0) {
        console.error(`re: building the reference failed (deno task setup-dev?): ${built.stderr}`);
        return 1;
      }
      const game = normalize(await objdump(rangeArgs(SLICE_PATH, start, end)));
      const reference = normalize(await objdump(symbolArgs(REFERENCE_PATH, args[0])));
      console.log(
        `${args[0]} at ${hex(start - IMAGE_BASE)}: game ${game.length} instructions, ` +
          `reference ${reference.length}, differing lines ${differingLines(reference, game)}`,
      );
      return 0;
    }
    case "hash": {
      if (!args[0]) break;
      const start = absolute(args[0]);
      const size = args[1] ? Number(args[1]) : endOf(start) - start;
      const h = fnv1a64(read(start, size)).toString(16).padStart(16, "0");
      console.log(`{"<name>", ${hex(start - IMAGE_BASE)}, ${hex(size)}, 0x${h}ULL},`);
      return 0;
    }
  }
  console.error(USAGE);
  return 2;
});
