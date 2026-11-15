/**
 * The subcommands of `deno task re`, as data: the one place their names, arguments and descriptions
 * are written. src/tasks/re.ts takes its usage text and argument checks from this list and must
 * implement every name in it (a type error otherwise); test/re/commands_test.ts checks the commands
 * table in docs/re-notes.md row for row against it. Listed in the order the re-notes steps use them.
 */

/** A subcommand: `args` in usage form (`<required>`, `[optional]`), `prints` as markdown. */
export type Command = { name: string; args: string; prints: string };

export const COMMANDS = [
  {
    name: "starts",
    args: "[from] [to]",
    prints: "function starts, from the slice's `LC_FUNCTION_STARTS`",
  },
  {
    name: "xrefs",
    args: "<string>",
    prints: "where the string sits in `__cstring`, and every `adrp` that loads its address",
  },
  {
    name: "annotate",
    args: "<start> [end]",
    prints:
      "the disassembly to the next function start, with each loaded string and each call to a `builds.h` function named",
  },
  {
    name: "compare",
    args: "<symbol> <start> [end]",
    prints:
      "the game function against the same symbol in stock `lapi.c` built at `-O2`: instruction counts and differing lines",
  },
  {
    name: "stats",
    args: "<getter>",
    prints:
      "a `GetAtOffset`-style getter's table: each stat id with its offset, width and signedness",
  },
  {
    name: "hash",
    args: "<start> [size]",
    prints:
      "a `builds.h` site line: offset, size (by default to the next function start) and FNV-1a hash",
  },
  {
    name: "area-fields",
    args: "",
    prints:
      "the object fields the engine compares with the area on screen, most compared first, each with the addresses of its comparisons",
  },
  {
    name: "id-fields",
    args: "",
    prints:
      "the area fields the engine compares with an object's own id, read through the object's area, in the same form",
  },
  {
    name: "effect-lists",
    args: "",
    prints:
      "the object fields that head a linked list whose elements the engine compares with constants: each with the element field, how many walks and the constants",
  },
] as const satisfies readonly Command[];

/** One of the listed commands, with its literal name, arguments and description. */
export type ListedCommand = (typeof COMMANDS)[number];

export type CommandName = ListedCommand["name"];

/** The command as typed: `deno task re hash <start> [size]`. */
export const invocation = (c: Command): string =>
  `deno task re ${c.name}${c.args ? ` ${c.args}` : ""}`;

/** How many arguments a command cannot run without. */
export const requiredArgs = (c: Command): number => c.args.match(/<[^>]+>/g)?.length ?? 0;

/** The named command, if it is one and has its required arguments. */
export const commandFor = (name: string | undefined, args: string[]): ListedCommand | undefined =>
  COMMANDS.find((c) => c.name === name && args.length >= requiredArgs(c));

/** The usage text: every command with what it prints, markdown backticks removed. */
export const usage = (): string =>
  [
    "usage:",
    ...COMMANDS.map((c) => `  ${invocation(c)}\n      ${c.prints.replaceAll("`", "")}`),
  ].join("\n");

/** The commands table's rows, as docs/re-notes.md must have them. */
export const notesRows = (): string[] =>
  COMMANDS.map((c) => `| \`${invocation(c)}\` | ${c.prints} |`);
