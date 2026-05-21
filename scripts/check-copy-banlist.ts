#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface BanRule {
  name: string;
  pattern: RegExp;
  reason: string;
}

const BAN_RULES: BanRule[] = [
  { name: "protocol-chrome", pattern: /\bACP\b|AcpDrawer/, reason: "COPY.md §1 says visible agent affordances say AI Assist, not ACP." },
  { name: "no-em-dash", pattern: /—|\\u2014/i, reason: "COPY.md §1 bans em dashes in visible copy." },
  { name: "marketing-start", pattern: /\bWelcome to Fulcrum!?|\bGet started!?/i, reason: "COPY.md §1 bans marketing/onboarding CTA copy." },
  { name: "status-synonym", pattern: /\b(?:In Flight|WIP|Doing|Stuck|Done!)\b/, reason: "COPY.md §6 locks status vocabulary." },
  { name: "generic-error", pattern: /\bSomething went wrong\b|\bOops!\b|\bPlease try again\b|\bContact support\b/i, reason: "COPY.md §3 requires action-specific recovery copy." },
  { name: "first-person-plural", pattern: /\bWe (?:couldn't|can't|cannot|could not)\b/i, reason: "COPY.md §1 bans first-person plural recovery copy." },
];

const SOURCE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib/components",
  "apps/cli/src",
  "apps/tui/src",
];

const RENDERED_OUTPUT_ROOTS = [
  "tests/cli/__snapshots__",
];

const FILE_EXTENSIONS = new Set([".svelte", ".ts", ".tsx", ".js", ".jsx", ".json", ".snap"]);

interface Candidate {
  file: string;
  line: number;
  text: string;
  source: "source" | "rendered";
}

interface Finding extends Candidate {
  rule: BanRule;
}

function extension(path: string): string {
  const match = path.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
}

function walkFiles(rootRel: string): string[] {
  const root = resolve(repoRoot, rootRel);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".svelte-kit" || entry.name === "dist") continue;
      const next = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(next);
        continue;
      }
      if (/\.(?:test|spec)\.[tj]sx?$/.test(entry.name)) continue;
      if (FILE_EXTENSIONS.has(extension(entry.name))) out.push(next);
    }
  };
  visit(root);
  return out;
}

function stripInlineComment(line: string): string {
  const trimmed = line.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("<!--")
  ) {
    return "";
  }
  return line.replace(/<!--.*?-->/g, "");
}

function quotedLiterals(line: string): string[] {
  const out: string[] = [];
  for (const pattern of [/"([^"\\]*(?:\\.[^"\\]*)*)"/g, /'([^'\\]*(?:\\.[^'\\]*)*)'/g, /`([^`\\]*(?:\\.[^`\\]*)*)`/g]) {
    for (const match of line.matchAll(pattern)) {
      const value = match[1].replace(/\\n/g, " ").replace(/\\"/g, "\"").replace(/\\'/g, "'");
      if (/[A-Za-z🎉]/.test(value)) out.push(value);
    }
  }
  return out;
}

function svelteText(line: string): string[] {
  if (!line.includes(">")) return [];
  const withoutTags = line
    .replace(/<script[\s\S]*$/g, "")
    .replace(/<style[\s\S]*$/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[A-Za-z🎉]/.test(withoutTags) ? [withoutTags] : [];
}

function candidatesForFile(absPath: string, source: Candidate["source"]): Candidate[] {
  const rel = relative(repoRoot, absPath);
  const isSvelte = absPath.endsWith(".svelte");
  const lines = readFileSync(absPath, "utf8").split(/\r?\n/);
  const candidates: Candidate[] = [];

  lines.forEach((raw, index) => {
    const line = stripInlineComment(raw);
    if (!line.trim()) return;
    const texts = source === "rendered" ? [line] : [...quotedLiterals(line), ...(isSvelte ? svelteText(line) : [])];
    for (const text of texts) candidates.push({ file: rel, line: index + 1, text, source });
  });

  return candidates;
}

function allowed(candidate: Candidate, rule: BanRule): boolean {
  const { file, text, source } = candidate;

  if (rule.name === "no-em-dash" && !isEmDashClosureSurface(candidate)) return true;

  // Non-visible tests may assert banned strings are absent.
  if (source === "rendered" && !file.includes("__snapshots__")) {
    if (/not\.toContain|Ban-list|banned|copy banlist|expect\(/i.test(text)) return true;
  }

  // Internal protocol/type names are allowed when they are source identifiers
  // rather than user-facing copy.
  if (rule.name === "protocol-chrome") {
    if (/packages\/ui-kit\/src\/(?:components\/acp-drawer|index\.ts)/.test(file)) return true;
    if (/\b(?:AcpDrawer[A-Za-z]*|ACP[A-Za-z]*|[A-Za-z]*ACP[A-Za-z]*)\b/.test(text) && !/\s/.test(text)) return true;
    if (/acp-session\.spec\.ts$/.test(file)) return true;
  }

  // The copy gate itself names banned examples so regressions are explicit.
  if (file === "scripts/check-copy-banlist.ts") return true;

  return false;
}

function isEmDashClosureSurface(candidate: Candidate): boolean {
  if (candidate.file === "apps/web/src/routes/onboarding/+page.svelte") return true;
  if (candidate.file.startsWith("apps/web/src/routes/doctor/")) return true;
  if (candidate.file === "apps/cli/src/commands/mode.ts") return true;
  if (candidate.file === "apps/cli/src/index.ts") return true;
  if (candidate.file === "apps/tui/src/widgets/StatusBar.ts") return true;
  if (candidate.source === "rendered") return true;
  return false;
}

function collectCandidates(): Candidate[] {
  const sourceFiles = SOURCE_ROOTS.flatMap(walkFiles);
  const renderedFiles = RENDERED_OUTPUT_ROOTS.flatMap(walkFiles);
  return [
    ...sourceFiles.flatMap((file) => candidatesForFile(file, "source")),
    ...renderedFiles.flatMap((file) => candidatesForFile(file, "rendered")),
  ];
}

function scan(candidates: Candidate[]): Finding[] {
  const findings: Finding[] = [];
  for (const candidate of candidates) {
    for (const rule of BAN_RULES) {
      if (!rule.pattern.test(candidate.text)) continue;
      if (allowed(candidate, rule)) continue;
      findings.push({ ...candidate, rule });
    }
  }
  return findings;
}

function runSelfTest(): void {
  const temp = join(tmpdir(), `fulcrum-copy-banlist-${process.pid}.svelte`);
  writeFileSync(temp, `<button>Get started</button>\n<p>AI Assist</p>\n`);
  try {
    const findings = scan(candidatesForFile(temp, "source"));
    if (!findings.some((finding) => finding.rule.name === "marketing-start")) {
      throw new Error("self-test failed: injected banned visible string was not detected");
    }
    console.log("check-copy-banlist self-test ok: injected banned visible string detected.");
  } finally {
    rmSync(temp, { force: true });
  }
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const findings = scan(collectCandidates());

if (findings.length > 0) {
  console.error("check-copy-banlist FAIL: banned visible copy found");
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}: ${finding.rule.name}: ${JSON.stringify(finding.text)}. ${finding.rule.reason}`,
    );
  }
  process.exit(1);
}

console.log("check-copy-banlist ok: no banned visible copy across web, CLI, TUI, and rendered/snapshot surfaces.");
