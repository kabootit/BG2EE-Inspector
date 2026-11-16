import { deepStrictEqual, strictEqual } from "node:assert/strict";
import {
  checkAdrs,
  checkEmDash,
  checkFences,
  checkLearnings,
  checkLinks,
  checkManualTests,
  checkNotes,
  checkPassive,
  checkPersonalInfo,
  checkPlans,
  checkReachable,
  type Doc,
  headingSlugs,
  lintDocs,
  loadDocs,
  MANUAL_TEST_SECTIONS,
  parseFrontmatter,
  resolveLink,
} from "../../src/lint/docs.ts";

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

Deno.test("the passive voice is a finding, with its words; the active voice is not", () => {
  const passive = (text: string) => checkPassive({ path: "a.md", text }).map((f) => f.detail);
  deepStrictEqual(passive("The slice is written on every run."), [
    '"is written": say who or what acts',
  ]);
  deepStrictEqual(passive("It was checked, then they were built."), [
    '"was checked": say who or what acts',
    '"were built": say who or what acts',
  ]);
  deepStrictEqual(passive("The ids are not read. A file is only unpacked once."), [
    '"are not read": say who or what acts',
    '"is only unpacked": say who or what acts',
  ]);
  deepStrictEqual(passive("The task writes the slice on every run."), []);
});

Deno.test("a passive split across lines, contracted, or in a quoted frontmatter value is a finding", () => {
  const found = (text: string) =>
    checkPassive({ path: "a.md", text }).map((f) => [f.line, f.detail]);
  deepStrictEqual(found("One line.\nThe slice is\nwritten on every run."), [
    [2, '"is written": say who or what acts'],
  ]);
  deepStrictEqual(found("It isn't stated, and it's defined later."), [
    [1, `"isn't stated": say who or what acts`],
    [1, `"it's defined": say who or what acts`],
  ]);
  deepStrictEqual(found('---\ndescription: "The list is read by the walker."\n---\n# A'), [
    [2, '"is read": say who or what acts'],
  ]);
});

Deno.test("a hyphenated adjective or a possessive is not passive", () => {
  const passive = (text: string) => checkPassive({ path: "a.md", text });
  deepStrictEqual(passive("The library is read-only."), []);
  deepStrictEqual(passive("The game's read access is narrow, and the task's set grows."), []);
});

Deno.test("passive words in code, inline code or quotes, and un- adjectives, are not findings", () => {
  const passive = (text: string) => checkPassive({ path: "a.md", text });
  deepStrictEqual(passive(`${FENCE}text\nit is written\n${FENCE}`), []);
  deepStrictEqual(passive("The test `it is written` passes."), []);
  deepStrictEqual(passive('The forum post says "files are loaded at startup".'), []);
  deepStrictEqual(passive("Compatibility is untested, and the output is unchanged."), []);
  deepStrictEqual(passive("This is indeed the speed it is."), []);
  deepStrictEqual(checkPassive({ path: "LICENSE.md", text: "THE SOFTWARE IS PROVIDED" }), []);
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
  const slugs = headingSlugs("# I.get(id): returns\n## Same\n## Same\n");
  strictEqual(slugs.has("iget_id-returns"), false, "not underscores");
  strictEqual(slugs.has("igetid-returns"), true);
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
    rules(checkNotes([{
      path: "docs/notes/setup-notes.md",
      text: "---\ntitle: T\ndescription: D\n---\n# T\n",
    }])),
    ["note-name"],
  );
  deepStrictEqual(
    checkNotes([{
      path: "docs/notes/2026-11-01-setup.md",
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

Deno.test("learnings are dated like notes, with front matter", () => {
  deepStrictEqual(
    rules(checkLearnings([{ path: "docs/learnings/declarative-parsing.md", text: "# x\n" }])),
    ["learning-name", "learning-frontmatter"],
  );
  deepStrictEqual(
    checkLearnings([{
      path: "docs/learnings/2026-11-14-declarative-parsing.md",
      text: "---\ntitle: T\ndescription: D\n---\n# T\n",
    }]),
    [],
  );
});

function manualTest(slug: string, fm: Record<string, string>, h1: string, sections: string[]): Doc {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return {
    path: `docs/manual-tests/${slug}.md`,
    text: `---\n${lines.join("\n")}\n---\n\n# ${h1}\n\n${
      sections.map((s) => `## ${s}\n`).join("\n")
    }`,
  };
}

const MANUAL_TEST_FM = {
  type: "manual-test",
  title: "Hook gate",
  description: "Why",
  duration: "about 15 minutes",
};
const MANUAL_TEST_INDEX: Doc = {
  path: "docs/manual-tests/README.md",
  text: "# Manual tests\n\n- [Hook gate](hook-gate.md)\n",
};

Deno.test("manual tests: name, frontmatter, heading, sections and registration", () => {
  const good = manualTest(
    "hook-gate",
    MANUAL_TEST_FM,
    "Manual test: Hook gate",
    MANUAL_TEST_SECTIONS,
  );
  deepStrictEqual(checkManualTests([MANUAL_TEST_INDEX, good]), []);

  const dated = { ...good, path: "docs/manual-tests/2026-11-01-hook-gate.md" };
  deepStrictEqual(rules(checkManualTests([MANUAL_TEST_INDEX, dated])), [
    "manual-test-name",
    "manual-test-unlisted",
  ]);
  const { duration: _, ...noDuration } = MANUAL_TEST_FM;
  deepStrictEqual(
    rules(checkManualTests([
      MANUAL_TEST_INDEX,
      manualTest("hook-gate", noDuration, "Manual test: Hook gate", MANUAL_TEST_SECTIONS),
    ])),
    ["manual-test-frontmatter"],
  );
  deepStrictEqual(
    rules(checkManualTests([
      MANUAL_TEST_INDEX,
      manualTest("hook-gate", MANUAL_TEST_FM, "Hook gate", MANUAL_TEST_SECTIONS),
    ])),
    ["manual-test-heading"],
  );
  deepStrictEqual(
    rules(checkManualTests([
      MANUAL_TEST_INDEX,
      manualTest(
        "hook-gate",
        MANUAL_TEST_FM,
        "Manual test: Hook gate",
        MANUAL_TEST_SECTIONS.slice(0, 4),
      ),
    ])),
    ["manual-test-section"],
  );
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
