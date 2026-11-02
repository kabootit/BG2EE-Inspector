import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  ALLOWED_INTERPOSE,
  audit,
  checkAttribution,
  checkBindAddress,
  checkClaudeSettings,
  checkHomePaths,
  checkImportMap,
  checkNative,
  checkPermissions,
  checkTestLocation,
  importAllowed,
  importsIn,
  REQUIRED_ASK,
  REQUIRED_DENY,
} from "../../src/lint/security.ts";

// Probe strings are assembled at runtime so this file never trips the linters itself.
const TRAILER = "Co-Authored" + "-By: Someone";
const FOOTER = "Generated" + " with [Claude Code](https://example.org)";
const HOME = "/Us" + "ers/alice";
const WRITE_CALL = "mach_vm" + "_write(task, addr, data, n);";

const checks = (findings: Array<{ check: string }>) => findings.map((f) => f.check);

Deno.test("imports: relative, allowed built-ins and pinned @std only", () => {
  strictEqual(importAllowed("./x.ts"), null);
  strictEqual(importAllowed("node:assert/strict"), null);
  strictEqual(importAllowed("jsr:@std/path@1"), null);
  strictEqual(typeof importAllowed("jsr:@std/path"), "string");
  strictEqual(typeof importAllowed("npm:left-pad"), "string");
  strictEqual(typeof importAllowed("https://example.org/mod.ts"), "string");
  strictEqual(typeof importAllowed("node:fs"), "string");
});

Deno.test("import forms are found; comments are not imports", () => {
  const text =
    `import { a } from "./a.ts";\n// import { b } from "npm:b";\nconst m = await import("jsr:@std/c@1");`;
  deepStrictEqual(importsIn(text).sort(), ["./a.ts", "jsr:@std/c@1"]);
});

Deno.test("an import map is a finding", () => {
  deepStrictEqual(checks(checkImportMap({ imports: { x: "npm:x" } })), ["dependencies"]);
  deepStrictEqual(checkImportMap({}), []);
});

Deno.test("permissions: no -A and no unscoped --allow-*", () => {
  deepStrictEqual(checks(checkPermissions({ a: "deno run -A x.ts" })), ["permissions"]);
  deepStrictEqual(checks(checkPermissions({ a: "deno run --allow-read x.ts" })), ["permissions"]);
  deepStrictEqual(checks(checkPermissions({ a: "deno run --allow-run x.ts --allow-net" })), [
    "permissions",
    "permissions",
  ]);
  deepStrictEqual(checks(checkPermissions({ a: "deno run --allow-run=ditto x.ts" })), [
    "permissions",
  ]);
  deepStrictEqual(
    checkPermissions({ a: "deno run --allow-read=. --allow-run=/usr/bin/ditto,/usr/bin/tar x.ts" }),
    [],
  );
});

Deno.test("servers must bind loopback", () => {
  deepStrictEqual(checks(checkBindAddress("s.ts", "Deno.serve({ port: 1 }, h)")), ["bind-address"]);
  deepStrictEqual(
    checkBindAddress("s.ts", `Deno.serve({ hostname: "127.0.0.1", port: 1 }, h)`),
    [],
  );
});

Deno.test("native code has no write path and no mprotect", () => {
  deepStrictEqual(checks(checkNative([{ file: "native/a.c", text: WRITE_CALL }])), [
    "native-read-only",
  ]);
  deepStrictEqual(checks(checkNative([{ file: "native/a.c", text: "mprotect(p, n, f);" }])), [
    "native-read-only",
  ]);
});

// The macro as native/a7x.c defines it, cut to the lines the check reads.
const MACRO = [
  "#define A7X_INTERPOSE(replacement, original) \\",
  '        __attribute__((section("__DATA,__interpose,interposing"))) = { \\',
  "        (const void *)&replacement, (const void *)&original};",
].join("\n");

Deno.test("native code interposes only allowlisted functions, through the macro", () => {
  const allowed = ALLOWED_INTERPOSE[0];
  deepStrictEqual(
    checkNative([{ file: "native/a.c", text: `${MACRO}\nA7X_INTERPOSE(mine, ${allowed})` }]),
    [],
  );
  deepStrictEqual(
    checks(checkNative([{ file: "native/a.c", text: `${MACRO}\nA7X_INTERPOSE(mine, open)` }])),
    ["native-interpose"],
  );
  const raw = 'static const void *p[2] __attribute__((section("__DATA, __interpose"))) = {a, b};';
  deepStrictEqual(checks(checkNative([{ file: "native/a.c", text: raw }])), ["native-interpose"]);
  deepStrictEqual(
    checks(checkNative([{ file: "native/a.c", text: MACRO }, { file: "native/b.c", text: MACRO }])),
    ["native-interpose"],
  );
});

Deno.test("Claude settings must keep the deny and ask entries", () => {
  const full = { permissions: { deny: REQUIRED_DENY, ask: REQUIRED_ASK } };
  deepStrictEqual(checkClaudeSettings(full), []);
  const noCurlDeny = {
    permissions: { deny: REQUIRED_DENY.filter((e) => e !== "Bash(curl:*)"), ask: REQUIRED_ASK },
  };
  deepStrictEqual(checks(checkClaudeSettings(noCurlDeny)), ["claude-settings"]);
  const noPushAsk = {
    permissions: { deny: REQUIRED_DENY, ask: REQUIRED_ASK.filter((e) => e !== "Bash(git push:*)") },
  };
  deepStrictEqual(checks(checkClaudeSettings(noPushAsk)), ["claude-settings"]);
});

Deno.test("AI attribution lines are findings", () => {
  deepStrictEqual(checks(checkAttribution("x.md", TRAILER)), ["no-attribution"]);
  deepStrictEqual(checks(checkAttribution("x.md", FOOTER)), ["no-attribution"]);
  deepStrictEqual(checkAttribution("x.md", "the rule forbids a `Co-Authored-By` trailer"), []);
});

Deno.test("home paths in code are findings", () => {
  deepStrictEqual(checks(checkHomePaths("x.ts", `const p = "${HOME}/game";`)), ["personal-info"]);
  deepStrictEqual(checkHomePaths("x.ts", `const p = "/Users/<name>";`), []);
});

Deno.test("tests outside test/ are findings", () => {
  deepStrictEqual(
    checks(checkTestLocation(["src/a_test.ts", "test/a_test.ts", "mod/x_test.lua"])),
    [
      "test-location",
      "test-location",
    ],
  );
});

Deno.test("the repository itself has no security findings", async () => {
  deepStrictEqual(await audit(), []);
});
