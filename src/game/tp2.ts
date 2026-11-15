/**
 * Reading mod/inspector/inspector.tp2 as the tests need it: its variables, the files it copies, the
 * patterns it counts in ui.menu, and its replacements, which `patch` applies as WeiDU would. The tp2
 * stays the one place its patterns are written; test/game/tp2_test.ts checks them against the game's
 * ui.menu and the copies against mod/inspector/lib/.
 *
 * Only the statements inspector.tp2 uses are read, by pattern, not by a WeiDU parser: full-line
 * `//` comments are dropped first, and every string is a `~...~` string.
 */

/** One REPLACE_TEXTUALLY: a WeiDU regexp, its replacement, and whether `%var%` is evaluated. */
export type Replace = { pattern: string; replacement: string; evaluate: boolean };

export type Tp2 = {
  vars: Map<string, string>;
  /** The source of each COPY pair, as written: `inspector/lib/a7x.lua`. */
  copies: string[];
  /** Each COUNT_REGEXP_INSTANCES pattern. */
  counted: string[];
  replaces: Replace[];
};

// The statements read, one pattern each. Every group takes part in every match (EVALUATE_BUFFER's
// matches an empty string when the keyword is absent), so each group is a string.
const STRING = "~([^~]*)~";
const VAR = new RegExp(`OUTER_SPRINT\\s+(\\w+)\\s+${STRING}`, "g");
const COPY = /\bCOPY\s((?:\s*~[^~]*~)+)/;
const COUNT = new RegExp(`COUNT_REGEXP_INSTANCES\\s+${STRING}`, "g");
const REPLACE = new RegExp(
  `REPLACE_TEXTUALLY\\s+(EVALUATE_BUFFER\\s+|)${STRING}\\s+${STRING}`,
  "g",
);

/** The groups of each match of `re` in `text`, in order. */
function groupsOf(text: string, re: RegExp): string[][] {
  return [...text.matchAll(re)].map((m): string[] => m.slice(1));
}

const isComment = (line: string): boolean => /^\s*\/\//.test(line);

export function readTp2(text: string): Tp2 {
  const lines: string[] = text.split("\n").filter((line: string): boolean => !isComment(line));
  const code: string = lines.join("\n");
  const copy: string = code.match(COPY)?.[1] ?? "";
  return {
    vars: new Map(groupsOf(code, VAR).map(([name, value]): [string, string] => [name, value])),
    copies: groupsOf(copy, new RegExp(STRING, "g"))
      .map(([path]): string => path)
      .filter((_: string, i: number): boolean => i % 2 === 0),
    counted: groupsOf(code, COUNT).map(([pattern]): string => pattern),
    replaces: groupsOf(code, REPLACE).map(([flag, pattern, replacement]): Replace => ({
      pattern,
      replacement,
      evaluate: flag !== "",
    })),
  };
}

/**
 * A WeiDU (OCaml Str) regexp as a JavaScript one: `\(` and `\)` group and `\|` alternates, while
 * a bare `(`, `)`, `{`, `}` or `|` is a literal character; `.`, `*`, `+`, `?`, `[...]`, `^` and `$`
 * mean the same in both.
 */
export function weiduRegex(pattern: string, flags = "g"): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      const next = pattern[++i];
      out += "()|".includes(next) ? next : `\\${next}`;
    } else out += "(){}|/".includes(c) ? `\\${c}` : c;
  }
  return new RegExp(out, flags);
}

/** How many times a WeiDU pattern matches `text`, as COUNT_REGEXP_INSTANCES counts. */
export const countMatches = (text: string, pattern: string): number =>
  [...text.matchAll(weiduRegex(pattern))].length;

/** `text` with every replacement applied in order, `\1` as the first group, as WeiDU does. */
export function patch(text: string, tp2: Tp2): string {
  return tp2.replaces.reduce((out: string, r: Replace): string => {
    const replacement: string = r.evaluate
      ? r.replacement.replace(
        /%(\w+)%/g,
        (m: string, name: string): string => tp2.vars.get(name) ?? m,
      )
      : r.replacement;
    // A function, not a string: a `$` in the replacement must stay a `$`. String.replace passes the
    // match, each group, then the offset and the whole text, so the arguments are not all strings.
    return out.replace(
      weiduRegex(r.pattern),
      (...args: unknown[]): string =>
        replacement.replace(/\\(\d)/g, (_: string, n: string): string => String(args[Number(n)])),
    );
  }, text);
}
