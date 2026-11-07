import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  annotate,
  differingLines,
  normalize,
  parseObjdump,
  rangeArgs,
} from "../../src/re/objdump.ts";
import { cstringAt } from "../../src/re/macho.ts";
import { CODE_VA, encode, richImage, words } from "./macho_fixture.ts";

// Two lines in the shape llvm-objdump prints them for the game, plus its banner.
const OUTPUT = [
  "",
  "game-arm64:\tfile format mach-o arm64",
  "",
  "Disassembly of section __TEXT,__text:",
  "",
  "0000000100335440 <__text+0x3340f0>:",
  "100335450:     \tadrp\tx21, 0x1035d7000 <dyld_stub_binder+0x1035d7000>",
  "100335464:     \tmov\tw2, #0x0                ; =0",
].join("\n");

Deno.test("objdump lines keep the address and instruction, without names and comments", () => {
  deepStrictEqual(parseObjdump(OUTPUT), [
    { addr: 0x100335450, text: "adrp x21, 0x1035d7000" },
    { addr: 0x100335464, text: "mov w2, #0x0" },
  ]);
});

Deno.test("a range is disassembled from start to stop", () => {
  deepStrictEqual(rangeArgs("s", 0x100001000, 0x100001010).slice(-3), [
    "--start-address=0x100001000",
    "--stop-address=0x100001010",
    "s",
  ]);
});

Deno.test("annotate names the string an ADRP+ADD loads and the function a BL calls", () => {
  const { bytes, cstringVa } = richImage(new Uint8Array(12), ["AC", "HP"], [CODE_VA]);
  const hp = cstringVa + 3;
  strictEqual(cstringAt(bytes, hp), "HP");
  const code = {
    addr: CODE_VA,
    bytes: words([
      encode.adrp(1, CODE_VA, hp),
      encode.add(1, 1, hp % 4096),
      encode.bl(CODE_VA + 8, 0x10054b3f4),
    ]),
  };
  const lines = [0, 4, 8].map((i) => ({ addr: CODE_VA + i, text: `ins${i}` }));
  const out = annotate(
    lines,
    code,
    (a) => cstringAt(bytes, a),
    new Map([[0x10054b3f4, "lua_pushstring"]]),
  );
  strictEqual(out[0].endsWith('; "HP"'), true);
  strictEqual(out[1], `${(CODE_VA + 4).toString(16)}  ins4`);
  strictEqual(out[2].endsWith("; lua_pushstring"), true);
});

Deno.test("comparison ignores addresses and counts the lines outside the common sequence", () => {
  const game = normalize([
    { addr: 0, text: "adrp x8, 0x100683000" },
    { addr: 4, text: "add x8, x8, #0x80" },
    { addr: 8, text: "ret" },
  ]);
  deepStrictEqual(game, ["adrp x8, ADDR", "add x8, x8, #ADDR", "ret"]);
  strictEqual(differingLines(game, game), 0);
  strictEqual(differingLines(["adrp x8, ADDR", "ldr x8, [x8]", "ret"], game), 2);
  strictEqual(differingLines([], game), 3);
});
