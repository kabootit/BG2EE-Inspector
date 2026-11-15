/**
 * `deno task re <command>`: the reverse-engineering tools behind docs/re-notes.md, run on the
 * installed game's arm64 slice. Addresses may be given image-relative (0x5499cc) or absolute
 * (0x1005499cc); output uses image-relative offsets, as native/builds.h does.
 *
 * The subcommands, their arguments and what each prints are listed in src/re/commands.ts; this
 * file implements them. A range's end defaults to the next function start. Writes only to build/re/.
 */
import { decodeStatGetter, referencesTo } from "../re/arm64.ts";
import { fnv1a64, parseBuilds } from "../re/builds.ts";
import { commandFor, type CommandName, usage } from "../re/commands.ts";
import { gameClock } from "../re/clock.ts";
import { areaFields, idFields, listFields, type Tally } from "../re/fields.ts";
import {
  archSlice,
  cstringAddresses,
  cstringAt,
  functionStarts,
  section,
  sections,
  segment,
} from "../re/macho.ts";
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
const CLOCK_FUNCTION = "Infinity_GetGameTicks";

const hex = (n: number) => `0x${n.toString(16)}`;
const absolute = (arg: string) => {
  const n = Number(arg);
  return n < IMAGE_BASE ? IMAGE_BASE + n : n;
};

await runTask(async () => {
  const [name, ...args] = Deno.args;
  const command = commandFor(name, args);
  if (!command) {
    console.error(usage());
    return 2;
  }
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
  const code = { bytes: slice.subarray(text.offset, text.offset + text.size), addr: text.addr };

  // Disassembly needs the slice as a file: objdump ignores address ranges on a universal binary.
  // Written on every run, so a game update never leaves a stale copy behind.
  const objdump = async (argv: string[]) => {
    await realSystem.makeDir(RE_DIR);
    await realSystem.writeBytes(SLICE_PATH, slice);
    const out = await realSystem.run(BIN.xcrun, argv);
    if (out.code !== 0) throw new Error(`llvm-objdump failed: ${out.stderr.trim()}`);
    return parseObjdump(out.stdout);
  };

  // One line per field, most compared first: offset, count, then each comparison's address.
  const printTally = (tally: Tally) => {
    for (const [offset, sites] of tally) {
      console.log(
        `+${hex(offset)}\t${sites.length}\t${sites.map((s) => hex(s - IMAGE_BASE)).join(" ")}`,
      );
    }
    return 0;
  };

  // Each command of src/re/commands.ts; its required arguments are already there.
  const run: Record<CommandName, () => number | Promise<number>> = {
    starts: () => {
      const [from, to] = [absolute(args[0] ?? "0"), absolute(args[1] ?? hex(2 ** 40))];
      for (const s of starts.filter((s) => s >= from && s < to)) console.log(hex(s - IMAGE_BASE));
      return 0;
    },
    xrefs: () => {
      const hits = cstringAddresses(slice, args[0]);
      for (const s of hits) {
        const refs = referencesTo(code, s).map((r) => hex(r - IMAGE_BASE));
        console.log(
          `${JSON.stringify(args[0])} at ${hex(s - IMAGE_BASE)}: ${refs.join(" ") || "-"}`,
        );
      }
      if (hits.length === 0) console.log(`${JSON.stringify(args[0])}: not in __cstring`);
      return 0;
    },
    annotate: async () => {
      const start = absolute(args[0]);
      const end = args[1] ? absolute(args[1]) : endOf(start);
      const names = new Map(
        parseBuilds(await readRepoFile("native/builds.h"))[0].sites
          .map((s) => [IMAGE_BASE + s.offset, s.name] as const),
      );
      const lines = await objdump(rangeArgs(SLICE_PATH, start, end));
      const range = { bytes: read(start, end - start), addr: start };
      for (const line of annotate(lines, range, (a) => cstringAt(slice, a), names)) {
        console.log(line);
      }
      return 0;
    },
    stats: () => {
      for (const f of decodeStatGetter(read, absolute(args[0]))) {
        console.log(
          f.kind === "load"
            ? `${f.id}\t+${hex(f.offset)}\t${f.signed ? "i" : "u"}${f.size * 8}`
            : `${f.id}\tcomputed (${hex(f.word >>> 0)})`,
        );
      }
      return 0;
    },
    compare: async () => {
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
    },
    hash: () => {
      const start = absolute(args[0]);
      const size = args[1] ? Number(args[1]) : endOf(start) - start;
      const h = fnv1a64(read(start, size)).toString(16).padStart(16, "0");
      console.log(`{"<name>", ${hex(start - IMAGE_BASE)}, ${hex(size)}, 0x${h}ULL},`);
      return 0;
    },
    "area-fields": () => printTally(areaFields(code)),
    "id-fields": () => printTally(idFields(code)),
    "effect-lists": () => {
      // One line per list: head offset, element field, walks, the constants compared, the sites.
      for (const l of listFields(code)) {
        const sites = l.sites.map((s) => hex(s - IMAGE_BASE)).join(" ");
        console.log(
          `+${hex(l.head)}\t+${hex(l.field)}\t${l.sites.length}\t${
            l.constants.join(" ")
          }\t${sites}`,
        );
      }
      return 0;
    },
    "game-clock": async () => {
      const name = cstringAddresses(slice, CLOCK_FUNCTION)[0];
      const clock = name === undefined ? undefined : gameClock(code, name);
      if (!clock) {
        console.error(`re: ${CLOCK_FUNCTION} is not registered in the shape src/re/clock.ts reads`);
        return 1;
      }
      const rel = (a: number) => hex(a - IMAGE_BASE);
      const chitin = (await readRepoFile("native/builds.h")).match(
        /\.baldur_chitin = (0x[0-9a-f]+)/,
      );
      const where = sections(slice).find((s) =>
        clock.multiplier >= s.addr && clock.multiplier < s.addr + s.size
      );
      // A zero-fill section (__bss, __common) has no bytes in the file.
      const stored = where && where.offset > 0
        ? new DataView(slice.buffer, slice.byteOffset).getUint32(
          where.offset + clock.multiplier - where.addr,
          true,
        )
        : undefined;
      console.log(
        `${CLOCK_FUNCTION}\tname ${rel(name)}\tregistered at ${rel(clock.registration)}\t` +
          `closure ${rel(clock.closure)}`,
      );
      console.log(
        `clock\t[${rel(clock.root)}] ${clock.chain.map((o) => `+${hex(o)}`).join(" ")}\t` +
          `u${clock.width * 8}\t${
            chitin && Number(chitin[1]) === clock.root - IMAGE_BASE
              ? "root is builds.h baldur_chitin"
              : "root is not builds.h baldur_chitin"
          }`,
      );
      console.log(
        `multiplier\t[${rel(clock.multiplier)}]\t${
          where ? `${where.segname},${where.sectname}` : "no section"
        }\t${stored === undefined ? "zero-filled" : `${stored} in the file`}`,
      );
      console.log(`returns\tclock × multiplier × ${2 ** clock.shift}`);
      return 0;
    },
  };
  return await run[command.name]();
});
