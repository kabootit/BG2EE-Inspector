/**
 * Security lint: the mechanical half of docs/rules/security-first.md.
 *
 * Run by `deno task lint:security` (src/tasks/lint_security.ts).
 *
 * Adapted from BG2EE-GameLog's src/lint.ts. Each check enforces one invariant;
 * the judgment half (is a new capability appropriate at all) is the
 * security-audit skill. Every check is a pure function with a failing probe in
 * test/lint/security_test.ts: a check that cannot go red reads as coverage it
 * does not give.
 */
import { readRepoFile, walkRepo } from "../shared/repo_files.ts";

export interface Finding {
  check: string;
  file: string;
  detail: string;
}

/** Deny entries that .claude/settings.json must keep (docs/rules/security-first.md). */
export const REQUIRED_DENY = [
  "Bash(brew install:*)",
  "Bash(brew upgrade:*)",
  "Bash(npm:*)",
  "Bash(npx:*)",
  "Bash(pip:*)",
  "Bash(pip3:*)",
  "Bash(python:*)",
  "Bash(python3:*)",
  "Bash(curl:*)",
  "Bash(wget:*)",
];

/**
 * Entries that must prompt rather than run (docs/rules/git.md). Push and remote
 * changes prompt instead of being denied, so an explicitly requested push works
 * while nothing leaves the machine without a confirmation.
 */
export const REQUIRED_ASK = [
  "Bash(git add:*)",
  "Bash(git commit:*)",
  "Bash(git push:*)",
  "Bash(git remote add:*)",
  "Bash(git remote set-url:*)",
  "Bash(gh repo create:*)",
];

/** Native calls that write memory or reach other processes. The bridge is read-only. */
export const FORBIDDEN_NATIVE = [
  "mach_vm_write",
  "vm_write",
  "mach_vm_protect",
  "vm_protect",
  "task_for_pid",
  "ptrace",
];

/** The one sanctioned mprotect: the luaL_Reg pointer swap (ADR-0002). */
export const MPROTECT_MARKER = "a7x-allow-mprotect: luaL_Reg swap";

/** Built-in modules that may be imported without a version pin. */
const BUILTINS = new Set(["node:assert/strict"]);

// --- dependencies ----------------------------------------------------------

/**
 * What may be imported: relative files, a short list of Deno built-ins, and the
 * Deno standard library with a pinned major version. Everything else fails.
 */
export function importAllowed(spec: string): string | null {
  if (BUILTINS.has(spec)) return null;
  if (spec.startsWith("./") || spec.startsWith("../")) return null;
  if (spec.startsWith("jsr:@std/")) {
    return /@\^?\d/.test(spec.slice("jsr:@std/".length))
      ? null
      : "must pin a major version, e.g. jsr:@std/assert@1";
  }
  return "not a relative file, an allowed built-in, or jsr:@std/*";
}

/** Drop whole comment lines, so prose about an import is not read as one. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : line;
    })
    .join("\n");
}

const IMPORT_FORMS = [
  /^\s*(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']/gm,
  /^\s*import\s*["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Every module specifier in a TypeScript source. */
export function importsIn(text: string): string[] {
  const code = codeOnly(text);
  const seen = new Set<string>();
  for (const form of IMPORT_FORMS) {
    for (const [, spec] of code.matchAll(form)) seen.add(spec);
  }
  return [...seen];
}

export function checkImports(file: string, text: string): Finding[] {
  return importsIn(text).flatMap((spec) => {
    const why = importAllowed(spec);
    return why === null
      ? []
      : [{ check: "dependencies", file, detail: `imports "${spec}": ${why}` }];
  });
}

/** An import map hides real specifiers from checkImports. */
export function checkImportMap(config: Record<string, unknown>): Finding[] {
  const imports = config.imports as Record<string, string> | undefined;
  return imports && Object.keys(imports).length > 0
    ? [{ check: "dependencies", file: "deno.json", detail: "declares an import map" }]
    : [];
}

// --- permissions -----------------------------------------------------------

/** No -A, and every --allow-* flag scoped with =value. */
export function checkPermissions(tasks: Record<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [task, command] of Object.entries(tasks)) {
    if (/(^|\s)(-A|--allow-all)(\s|$)/.test(command)) {
      out.push({
        check: "permissions",
        file: "deno.json",
        detail: `task "${task}" grants --allow-all`,
      });
    }
    for (const m of command.matchAll(/--allow-[a-z-]+(?![=a-z-])/g)) {
      out.push({
        check: "permissions",
        file: "deno.json",
        detail: `task "${task}" grants blanket ${m[0]}`,
      });
    }
  }
  return out;
}

// --- network ---------------------------------------------------------------

/** Any server binds loopback only. */
export function checkBindAddress(file: string, text: string): Finding[] {
  if (!text.includes("Deno.serve(")) return [];
  const out: Finding[] = [];
  if (!text.includes(`hostname: "127.0.0.1"`)) {
    out.push({ check: "bind-address", file, detail: `Deno.serve without hostname: "127.0.0.1"` });
  }
  if (/0\.0\.0\.0|hostname:\s*""/.test(text)) {
    out.push({ check: "bind-address", file, detail: "binds a non-loopback address" });
  }
  return out;
}

// --- native ----------------------------------------------------------------

/** The dylib has no write path, and mprotect appears only at the marked luaL_Reg site. */
export function checkNative(sources: Array<{ file: string; text: string }>): Finding[] {
  const out: Finding[] = [];
  let mprotectSites = 0;
  for (const { file, text } of sources) {
    for (const [i, line] of text.split("\n").entries()) {
      for (const name of FORBIDDEN_NATIVE) {
        if (new RegExp(`\\b${name}\\b`).test(line)) {
          out.push({ check: "native-read-only", file, detail: `line ${i + 1} uses ${name}` });
        }
      }
      if (/\bmprotect\s*\(/.test(line)) {
        if (line.includes(MPROTECT_MARKER)) mprotectSites++;
        else {out.push({
            check: "native-read-only",
            file,
            detail: `line ${i + 1}: unmarked mprotect`,
          });}
      }
    }
  }
  if (mprotectSites > 1) {
    out.push({
      check: "native-read-only",
      file: "native/",
      detail: `${mprotectSites} mprotect sites; only one is sanctioned`,
    });
  }
  return out;
}

// --- Claude Code settings --------------------------------------------------

/** The committed deny and ask lists still hold the required entries. */
export function checkClaudeSettings(settings: unknown): Finding[] {
  const permissions = (settings as { permissions?: { deny?: string[]; ask?: string[] } })
    ?.permissions;
  const deny = new Set(permissions?.deny ?? []);
  const ask = new Set(permissions?.ask ?? []);
  return [
    ...REQUIRED_DENY.filter((e) => !deny.has(e)).map((e) => ({
      check: "claude-settings",
      file: ".claude/settings.json",
      detail: `deny list is missing ${e}`,
    })),
    ...REQUIRED_ASK.filter((e) => !ask.has(e)).map((e) => ({
      check: "claude-settings",
      file: ".claude/settings.json",
      detail: `ask list is missing ${e}`,
    })),
  ];
}

// --- text in any file ------------------------------------------------------

/** docs/rules/git.md: no AI attribution trailers or footers anywhere. */
export function checkAttribution(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (/^\s*Co-Authored-By:/i.test(line) || /Generated with \[?Claude/i.test(line)) {
      out.push({
        check: "no-attribution",
        file,
        detail: `line ${i + 1} carries an AI attribution line`,
      });
    }
  }
  return out;
}

/** No home-directory paths in code (docs are covered by lint:docs). */
export function checkHomePaths(file: string, text: string): Finding[] {
  const m = text.match(/\/Users\/(?!<name>)[^/\s`'")<>\]]+/);
  return m ? [{ check: "personal-info", file, detail: `home-directory path ${m[0]}` }] : [];
}

/** docs/rules/tests.md: tests live in test/, never beside source. */
export function checkTestLocation(files: string[]): Finding[] {
  return files
    .filter((f) => /_test\.(ts|lua)$/.test(f) && !f.startsWith("test/"))
    .map((f) => ({ check: "test-location", file: f, detail: "tests belong in test/" }));
}

// --- runner ----------------------------------------------------------------

const TEXT_EXTENSIONS = /\.(md|ts|lua|c|h|json|jsonc|tp2|menu)$/;

export async function audit(): Promise<Finding[]> {
  const { files } = await walkRepo();
  const out: Finding[] = [];

  const config = JSON.parse(await readRepoFile("deno.json"));
  out.push(...checkImportMap(config), ...checkPermissions(config.tasks ?? {}));

  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    const text = await readRepoFile(file);
    out.push(...checkImports(file, text), ...checkBindAddress(file, text));
  }

  const native = [];
  for (const file of files.filter((f) => f.startsWith("native/") && /\.(c|h|m)$/.test(f))) {
    native.push({ file, text: await readRepoFile(file) });
  }
  out.push(...checkNative(native));

  if (files.includes(".claude/settings.json")) {
    out.push(...checkClaudeSettings(JSON.parse(await readRepoFile(".claude/settings.json"))));
  } else {
    out.push({ check: "claude-settings", file: ".claude/settings.json", detail: "missing" });
  }

  for (const file of files.filter((f) => TEXT_EXTENSIONS.test(f))) {
    const text = await readRepoFile(file);
    out.push(...checkAttribution(file, text));
    if (!file.endsWith(".md")) out.push(...checkHomePaths(file, text));
  }

  out.push(...checkTestLocation(files));
  return out;
}
