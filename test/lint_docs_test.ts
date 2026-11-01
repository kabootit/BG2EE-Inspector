import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  checkAdrs,
  checkEmDash,
  checkFences,
  checkLinks,
  checkNotes,
  checkPersonalInfo,
  checkPlans,
  checkReachable,
  type Doc,
  headingSlugs,
  lintDocs,
  loadDocs,
  parseFrontmatter,
  resolveLink,
} from "../src/lint_docs.ts";

// Probe strings are assembled at runtime so this file never trips the linters itself.
const EM_DASH = String.fromCharCode(0x2014);
const HOME = "/Us" + "ers/alice";
const EMAIL = "someone" + "@" + "mail.test";
const FENCE = "`".repeat(3);

const rules = (findings: Array<{ rule: string }>) => findings.map((f) => f.rule);

function adr(id: string, extra: Partial<Record<string, string>> = {}, h1?: string): Doc {
  const fm = {
    type: "ADR",
    id,
    title: "A decision",
    description: "Why",
    status: "active",
    date: "2026-11-01",
    ...extra,
  };
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return {
    path: `docs/adr/${id}-a-decision.md`,
    text: `---\n${lines.join("\n")}\n---\n\n# ${h1 ?? `ADR-${id}: ${fm.title}`}\n`,
  };
}

const ADR_INDEX: Doc = {
  path: "docs/adr/README.md",
  text: "# ADRs\n\n- [0001](0001-a-decision.md)\n- [0002](0002-a-decision.md)\n",
};

Deno.test("em dash is a finding, in prose and in code", () => {
  deepStrictEqual(rules(checkEmDash({ path: "a.md", text: `one ${EM_DASH} two` })), ["em-dash"]);
  deepStrictEqual(
    rules(checkEmDash({ path: "a.md", text: `${FENCE}text\nx ${EM_DASH} y\n${FENCE}` })),
    ["em-dash"],
  );
  deepStrictEqual(checkEmDash({ path: "a.md", text: "one, two: three" }), []);
});

Deno.test("home paths and email addresses are findings; the placeholder is not", () => {
  deepStrictEqual(rules(checkPersonalInfo({ path: "a.md", text: `see ${HOME}/game` })), [
    "personal-info",
  ]);
  deepStrictEqual(rules(checkPersonalInfo({ path: "a.md", text: `mail ${EMAIL}` })), [
    "personal-info",
  ]);
  deepStrictEqual(checkPersonalInfo({ path: "a.md", text: "a `/Users/<name>` path" }), []);
  deepStrictEqual(checkPersonalInfo({ path: "a.md", text: "jsr:@std/assert@1" }), []);
});

Deno.test("fences need an allowlisted language", () => {
  deepStrictEqual(rules(checkFences({ path: "a.md", text: `${FENCE}\nx\n${FENCE}` })), [
    "fence-lang",
  ]);
  deepStrictEqual(rules(checkFences({ path: "a.md", text: `${FENCE}cobol\nx\n${FENCE}` })), [
    "fence-lang",
  ]);
  deepStrictEqual(
    checkFences({ path: "a.md", text: `${FENCE}mermaid\nflowchart TD\n${FENCE}` }),
    [],
  );
});

Deno.test("dead links and anchors are findings", () => {
  const target: Doc = { path: "docs/b.md", text: "# Title\n\n## Some Section\n" };
  const docs = new Map([[target.path, target]]);
  const files = new Set(["docs/b.md"]);
  const check = (text: string) =>
    rules(checkLinks({ path: "docs/a.md", text }, docs, files, new Set(["docs"])));
  deepStrictEqual(check("[x](missing.md)"), ["dead-link"]);
  deepStrictEqual(check("[x](b.md#nope)"), ["dead-anchor"]);
  deepStrictEqual(check("[x](b.md#some-section) [y](https://example.org) [z](../docs/)"), []);
  deepStrictEqual(check("`[x](missing.md)` in code"), []);
});

Deno.test("heading slugs follow GitHub's rules", () => {
  const slugs = headingSlugs("# A7X.get(id): returns\n## Same\n## Same\n");
  strictEqual(slugs.has("a7xgetid-returns"), true);
  strictEqual(slugs.has("same-1"), true);
});

Deno.test("relative links resolve against the linking file", () => {
  strictEqual(resolveLink("docs/rules/git.md", "../adr/0001-x.md"), "docs/adr/0001-x.md");
  strictEqual(resolveLink("README.md", "docs/README.md"), "docs/README.md");
});

Deno.test("frontmatter parses quoted values and drops trailing comments", () => {
  deepStrictEqual(parseFrontmatter('---\nid: "0001"\nstatus: active  # note\n---\n'), {
    id: "0001",
    status: "active",
  });
  strictEqual(parseFrontmatter("# no frontmatter"), null);
});

Deno.test("ADRs: frontmatter, heading, sequence and registration", () => {
  deepStrictEqual(checkAdrs([ADR_INDEX, adr("0001"), adr("0002")]), []);
  deepStrictEqual(rules(checkAdrs([ADR_INDEX, adr("0001", { status: "maybe" }), adr("0002")])), [
    "adr-frontmatter",
  ]);
  deepStrictEqual(rules(checkAdrs([ADR_INDEX, adr("0001", {}, "ADR-0001: Other"), adr("0002")])), [
    "adr-heading",
  ]);
  deepStrictEqual(rules(checkAdrs([ADR_INDEX, adr("0001"), adr("0003")])), [
    "adr-unlisted",
    "adr-sequence",
  ]);
  deepStrictEqual(
    rules(checkAdrs([{ path: "docs/adr/README.md", text: "# ADRs\n" }, adr("0001")])),
    ["adr-unlisted"],
  );
});

Deno.test("notes and plans follow their naming and front matter", () => {
  deepStrictEqual(rules(checkNotes([{ path: "docs/notes/step.md", text: "# x\n" }])), [
    "note-name",
    "note-frontmatter",
  ]);
  deepStrictEqual(
    checkNotes([{
      path: "docs/notes/step-notes.md",
      text: "---\ntitle: T\ndescription: D\n---\n# T\n",
    }]),
    [],
  );
  deepStrictEqual(rules(checkPlans([{ path: "docs/plans/plan.md", text: "# Something\n" }])), [
    "plan-name",
    "plan-heading",
  ]);
  deepStrictEqual(checkPlans([{ path: "docs/plans/2026-11-01-x.md", text: "# Plan: X\n" }]), []);
});

Deno.test("every docs page must be reachable from docs/README.md", () => {
  const docs: Doc[] = [
    { path: "README.md", text: "[docs](docs/README.md)" },
    { path: "docs/README.md", text: "[a](a.md)" },
    { path: "docs/a.md", text: "# A" },
    { path: "docs/orphan.md", text: "# Orphan" },
  ];
  deepStrictEqual(checkReachable(docs).map((f) => f.file), ["docs/orphan.md"]);
});

Deno.test("the repository itself has no docs findings", async () => {
  const { docs, files, dirs } = await loadDocs();
  deepStrictEqual(lintDocs(docs, files, dirs), []);
});
