/**
 * Docs lint: the mechanical half of docs/rules/docs.md and docs/rules/writing-style.md.
 *
 *   deno task lint:docs
 *
 * Everything decidable is checked here so review time goes to what is not
 * (see the docs-review skill): ADR format and registration, plan and note
 * naming, reachability from docs/README.md, dead links and anchors, fence
 * languages, em dashes, and personal information.
 *
 * Every check is a pure function over in-memory text, so each one has a probe
 * in test/lint_docs_test.ts that shows it failing.
 */
import { requireDeno } from "./deno_version.ts";
import { readRepoFile, walkRepo } from "./repo_files.ts";

export interface Finding {
  rule: string;
  file: string;
  line: number;
  detail: string;
}

export interface Doc {
  /** Repo-relative path with forward slashes. */
  path: string;
  text: string;
}

/** Fence languages allowed in docs. GitHub renders all of these, mermaid included. */
export const FENCE_LANGUAGES = new Set([
  "c",
  "diff",
  "ini",
  "js",
  "json",
  "jsonc",
  "lua",
  "markdown",
  "mermaid",
  "sh",
  "text",
  "ts",
  "yaml",
]);

export const ADR_STATUSES = new Set(["proposed", "active", "superseded", "retired"]);

const EM_DASH = "—";

// --- helpers ---------------------------------------------------------------

/** Which lines sit inside a fenced code block (fence lines themselves count as inside). */
export function codeLines(text: string): boolean[] {
  const lines = text.split("\n");
  const inside: boolean[] = [];
  let open: string | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (open === null && m) {
      open = m[1][0];
      inside.push(true);
    } else if (open !== null && m && m[1][0] === open && line.trim().replace(/[`~]/g, "") === "") {
      open = null;
      inside.push(true);
    } else {
      inside.push(open !== null);
    }
  }
  return inside;
}

/** Simple `key: value` frontmatter. Returns null when the text has none. */
export function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const fields: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, "").trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    fields[m[1]] = value;
  }
  return fields;
}

/** The first H1 and its 1-based line number, ignoring code blocks. */
export function firstHeading(text: string): { text: string; line: number } | null {
  const inside = codeLines(text);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!inside[i] && lines[i].startsWith("# ")) {
      return { text: lines[i].slice(2).trim(), line: i + 1 };
    }
  }
  return null;
}

/** GitHub-style anchor slugs for every heading in a document. */
export function headingSlugs(text: string): Set<string> {
  const inside = codeLines(text);
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (inside[i]) return;
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (!m) return;
    const base = m[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  });
  return slugs;
}

export interface Link {
  target: string;
  line: number;
}

/** Inline markdown links outside code blocks and inline code. */
export function extractLinks(text: string): Link[] {
  const inside = codeLines(text);
  const links: Link[] = [];
  text.split("\n").forEach((line, i) => {
    if (inside[i]) return;
    const prose = line.replace(/`[^`]*`/g, "");
    for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ target: m[1], line: i + 1 });
    }
  });
  return links;
}

/** Resolve a relative link target against the linking document's path. */
export function resolveLink(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

// --- checks ----------------------------------------------------------------

/** writing-style.md: no em dashes anywhere, code blocks included. */
export function checkEmDash(doc: Doc): Finding[] {
  const out: Finding[] = [];
  doc.text.split("\n").forEach((line, i) => {
    if (line.includes(EM_DASH)) {
      out.push({
        rule: "em-dash",
        file: doc.path,
        line: i + 1,
        detail: "use a comma, colon, parentheses or a full stop",
      });
    }
  });
  return out;
}

/** writing-style.md: no home-directory paths or email addresses. `/Users/<name>` is the allowed placeholder. */
export function checkPersonalInfo(doc: Doc): Finding[] {
  const out: Finding[] = [];
  doc.text.split("\n").forEach((line, i) => {
    const home = line.match(/\/Users\/(?!<name>)[^/\s`'")<>\]]+/);
    if (home) {
      out.push({
        rule: "personal-info",
        file: doc.path,
        line: i + 1,
        detail: `home-directory path ${home[0]}`,
      });
    }
    const email = line.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
    if (email && !/@example\.(com|org)$/.test(email[0])) {
      out.push({
        rule: "personal-info",
        file: doc.path,
        line: i + 1,
        detail: `email address ${email[0]}`,
      });
    }
  });
  return out;
}

/** Every opening fence declares a language from FENCE_LANGUAGES. */
export function checkFences(doc: Doc): Finding[] {
  const out: Finding[] = [];
  let open: string | null = null;
  doc.text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!m) return;
    if (open === null) {
      open = m[1][0];
      const lang = m[2].trim().split(/\s+/)[0];
      if (lang === "") {
        out.push({
          rule: "fence-lang",
          file: doc.path,
          line: i + 1,
          detail: "fenced block has no language",
        });
      } else if (!FENCE_LANGUAGES.has(lang)) {
        out.push({
          rule: "fence-lang",
          file: doc.path,
          line: i + 1,
          detail: `language "${lang}" is not in the allowlist`,
        });
      }
    } else if (m[1][0] === open && m[2].trim() === "") {
      open = null;
    }
  });
  return out;
}

/** Relative links resolve to a file or directory, and anchors to a heading. */
export function checkLinks(
  doc: Doc,
  docs: Map<string, Doc>,
  files: Set<string>,
  dirs: Set<string>,
): Finding[] {
  const out: Finding[] = [];
  for (const { target, line } of extractLinks(doc.text)) {
    if (isExternal(target)) continue;
    const [pathPart, anchor] = target.split("#", 2);
    const resolved = pathPart === "" ? doc.path : resolveLink(doc.path, pathPart);
    const isDir = dirs.has(resolved.replace(/\/$/, ""));
    if (pathPart !== "" && !files.has(resolved) && !isDir) {
      out.push({ rule: "dead-link", file: doc.path, line, detail: `${target} does not exist` });
      continue;
    }
    if (anchor !== undefined && anchor !== "") {
      const targetDoc = docs.get(resolved);
      if (targetDoc && !headingSlugs(targetDoc.text).has(anchor)) {
        out.push({
          rule: "dead-anchor",
          file: doc.path,
          line,
          detail: `${target}: no heading with that anchor`,
        });
      }
    }
  }
  return out;
}

/** docs/rules/docs.md: ADR naming, frontmatter, H1, sequence and registration. */
export function checkAdrs(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  const index = docs.find((d) => d.path === "docs/adr/README.md");
  const adrs = docs.filter((d) =>
    d.path.startsWith("docs/adr/") && !d.path.endsWith("/README.md") &&
    !d.path.endsWith("/0000-template.md")
  );
  const ids: number[] = [];
  for (const doc of adrs) {
    const name = doc.path.slice("docs/adr/".length);
    const m = name.match(/^(\d{4})-[a-z0-9-]+\.md$/);
    if (!m) {
      out.push({
        rule: "adr-name",
        file: doc.path,
        line: 1,
        detail: "ADR files are named NNNN-slug.md",
      });
      continue;
    }
    ids.push(parseInt(m[1], 10));
    const fm = parseFrontmatter(doc.text);
    if (!fm) {
      out.push({ rule: "adr-frontmatter", file: doc.path, line: 1, detail: "missing frontmatter" });
      continue;
    }
    const problems: string[] = [];
    if (fm.type !== "ADR") problems.push("type must be ADR");
    if (fm.id !== m[1]) problems.push(`id must be "${m[1]}"`);
    if (!fm.title) problems.push("title is required");
    if (!fm.description) problems.push("description is required");
    if (!ADR_STATUSES.has(fm.status ?? "")) {
      problems.push(`status must be one of ${[...ADR_STATUSES].join(", ")}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date ?? "")) problems.push("date must be YYYY-MM-DD");
    if (fm.status === "superseded" && !fm.superseded_by) {
      problems.push("superseded ADRs need superseded_by");
    }
    for (const p of problems) {
      out.push({ rule: "adr-frontmatter", file: doc.path, line: 1, detail: p });
    }
    const h1 = firstHeading(doc.text);
    const expected = `ADR-${m[1]}: ${fm.title}`;
    if (!h1 || h1.text !== expected) {
      out.push({
        rule: "adr-heading",
        file: doc.path,
        line: h1?.line ?? 1,
        detail: `H1 must be "# ${expected}"`,
      });
    }
    if (
      index &&
      !extractLinks(index.text).some((l) =>
        resolveLink(index.path, l.target.split("#")[0]) === doc.path
      )
    ) {
      out.push({
        rule: "adr-unlisted",
        file: doc.path,
        line: 1,
        detail: "not linked from docs/adr/README.md",
      });
    }
  }
  ids.sort((a, b) => a - b).forEach((id, i) => {
    if (id !== i + 1) {
      out.push({
        rule: "adr-sequence",
        file: "docs/adr",
        line: 1,
        detail: `ids must run 0001..; found ${String(id).padStart(4, "0")} at position ${i + 1}`,
      });
    }
  });
  return out;
}

/** Delivery notes: `<topic>-notes.md` with title and description frontmatter. */
export function checkNotes(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  for (
    const doc of docs.filter((d) =>
      d.path.startsWith("docs/notes/") && !d.path.endsWith("/README.md")
    )
  ) {
    if (!/^docs\/notes\/[a-z0-9-]+-notes\.md$/.test(doc.path)) {
      out.push({
        rule: "note-name",
        file: doc.path,
        line: 1,
        detail: "delivery notes are named <topic>-notes.md",
      });
    }
    const fm = parseFrontmatter(doc.text);
    if (!fm?.title || !fm?.description) {
      out.push({
        rule: "note-frontmatter",
        file: doc.path,
        line: 1,
        detail: "title and description are required",
      });
    }
  }
  return out;
}

/** Plans: `YYYY-MM-DD-topic.md` with an H1 starting "Plan: ". */
export function checkPlans(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  for (
    const doc of docs.filter((d) =>
      d.path.startsWith("docs/plans/") && !d.path.endsWith("/README.md")
    )
  ) {
    if (!/^docs\/plans\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(doc.path)) {
      out.push({
        rule: "plan-name",
        file: doc.path,
        line: 1,
        detail: "plans are named YYYY-MM-DD-topic.md",
      });
    }
    const h1 = firstHeading(doc.text);
    if (!h1 || !h1.text.startsWith("Plan: ")) {
      out.push({
        rule: "plan-heading",
        file: doc.path,
        line: h1?.line ?? 1,
        detail: 'H1 must start with "Plan: "',
      });
    }
  }
  return out;
}

/** Every docs/ page is reachable by links from docs/README.md, which README.md links. */
export function checkReachable(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const root = byPath.get("README.md");
  if (
    root &&
    !extractLinks(root.text).some((l) =>
      resolveLink("README.md", l.target.split("#")[0]) === "docs/README.md"
    )
  ) {
    out.push({
      rule: "unreachable",
      file: "README.md",
      line: 1,
      detail: "does not link docs/README.md",
    });
  }
  const seen = new Set<string>();
  const queue = byPath.has("docs/README.md") ? ["docs/README.md"] : [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const l of extractLinks(byPath.get(path)!.text)) {
      if (isExternal(l.target)) continue;
      const next = resolveLink(path, l.target.split("#")[0]);
      if (byPath.has(next) && next.startsWith("docs/")) queue.push(next);
    }
  }
  for (const doc of docs) {
    if (doc.path.startsWith("docs/") && !seen.has(doc.path)) {
      out.push({
        rule: "unreachable",
        file: doc.path,
        line: 1,
        detail: "not reachable by links from docs/README.md",
      });
    }
  }
  return out;
}

/** Run every check over a set of markdown documents. */
export function lintDocs(docs: Doc[], files: Set<string>, dirs: Set<string>): Finding[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const findings: Finding[] = [];
  for (const doc of docs) {
    findings.push(...checkEmDash(doc), ...checkPersonalInfo(doc), ...checkFences(doc));
    findings.push(...checkLinks(doc, byPath, files, dirs));
  }
  findings.push(
    ...checkAdrs(docs),
    ...checkNotes(docs),
    ...checkPlans(docs),
    ...checkReachable(docs),
  );
  return findings;
}

/** Load every markdown file in the repo. */
export async function loadDocs(): Promise<{ docs: Doc[]; files: Set<string>; dirs: Set<string> }> {
  const { files, dirs } = await walkRepo();
  const docs: Doc[] = [];
  for (const path of files.filter((f) => f.endsWith(".md"))) {
    docs.push({ path, text: await readRepoFile(path) });
  }
  return { docs, files: new Set(files), dirs: new Set(dirs) };
}

async function main() {
  requireDeno();
  const { docs, files, dirs } = await loadDocs();
  const findings = lintDocs(docs, files, dirs);
  if (findings.length === 0) {
    console.log(`lint:docs  ${docs.length} markdown files, no findings`);
    return;
  }
  for (const f of findings) console.error(`  [${f.rule}] ${f.file}:${f.line}  ${f.detail}`);
  console.error(
    `\n${findings.length} docs finding(s). Rules: docs/rules/docs.md, docs/rules/writing-style.md`,
  );
  Deno.exit(1);
}

if (import.meta.main) await main();
