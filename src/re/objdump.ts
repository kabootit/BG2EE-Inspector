/**
 * Reading `llvm-objdump` output, and annotating and comparing it.
 *
 * objdump gives the human-readable instructions; the meaning attached to them
 * (which C string an ADRP+ADD pair loads, which engine function a BL calls)
 * comes from arm64.ts decoding the same bytes, not from parsing objdump's text.
 */
import { bl, type Code, resolvedReferences } from "./arm64.ts";

/** One disassembled instruction: its address and objdump's text for it. */
export type Line = { addr: number; text: string };

/** `xcrun llvm-objdump` arguments for a range of a thin slice. */
export const rangeArgs = (file: string, start: number, end: number) => [
  "llvm-objdump",
  "-d",
  "--no-show-raw-insn",
  `--start-address=0x${start.toString(16)}`,
  `--stop-address=0x${end.toString(16)}`,
  file,
];

/** `xcrun llvm-objdump` arguments for one symbol of an object file. */
export const symbolArgs = (file: string, symbol: string) => [
  "llvm-objdump",
  "-d",
  "--no-show-raw-insn",
  `--disassemble-symbols=${symbol}`,
  file,
];

/** The instruction lines of objdump output, without its comments and symbolic `<…>` names. */
export function parseObjdump(text: string): Line[] {
  return text.split("\n").flatMap((raw) => {
    const m = raw.match(/^\s*([0-9a-f]+):\s+(.*)$/);
    if (!m) return [];
    const ins = m[2].replace(/\s*<[^>]*>/g, "").replace(/\s*;.*$/, "").replace(/\s+/g, " ").trim();
    return ins ? [{ addr: parseInt(m[1], 16), text: ins }] : [];
  });
}

/**
 * Each line with a comment where one helps: the C string an ADRP+ADD/LDR pair resolves to (or the
 * address, when it is not a string), and the name of a known function a BL calls.
 */
export function annotate(
  lines: Line[],
  code: Code,
  cstring: (addr: number) => string | undefined,
  names: Map<number, string>,
): string[] {
  const resolved = new Map(resolvedReferences(code).map((r) => [r.at, r.target]));
  const word = (addr: number) => {
    const i = addr - code.addr;
    return code.bytes[i] | (code.bytes[i + 1] << 8) | (code.bytes[i + 2] << 16) |
      (code.bytes[i + 3] << 24);
  };
  return lines.map(({ addr, text }) => {
    const notes: string[] = [];
    const target = resolved.get(addr);
    if (target !== undefined) {
      const s = cstring(target);
      notes.push(s === undefined ? `0x${target.toString(16)}` : JSON.stringify(s));
    }
    const call = addr >= code.addr && addr < code.addr + code.bytes.length
      ? bl(word(addr), addr)
      : undefined;
    if (call !== undefined && names.has(call)) notes.push(names.get(call)!);
    const head = `${addr.toString(16)}  ${text}`;
    return notes.length ? `${head.padEnd(48)} ; ${notes.join(", ")}` : head;
  });
}

/**
 * Instructions with what a linked image and an object file legitimately differ in taken out:
 * addresses and immediates that are PC-relative or relocated become `ADDR`.
 */
export const normalize = (lines: Line[]) =>
  lines.map((l) => l.text.replace(/0x[0-9a-f]+/g, "ADDR"));

/** How many lines of `a` and `b` are outside their longest common subsequence. */
export function differingLines(a: string[], b: string[]): number {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  return a.length + b.length - 2 * lcs[0][0];
}
