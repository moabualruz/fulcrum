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
  { name: "protocol-chrome", pattern: /\bACP\b|\bacp\b|AcpDrawer/i, reason: "COPY.md §1.10 says visible agent affordances say AI Assist, not ACP." },
  { name: "chat-label", pattern: /\bchat\b/i, reason: "COPY.md §1.10 says visible agent affordances say AI Assist, not chat." },
  { name: "no-em-dash", pattern: /—|\\u2014/i, reason: "COPY.md §1 bans em dashes in visible copy." },
  { name: "no-decorative-sparkle", pattern: /✨|\\u2728/i, reason: "COPY.md §1 bans decorative sparkle glyphs in visible copy." },
  { name: "marketing-start", pattern: /\bWelcome to Fulcrum!?|\bGet started!?/i, reason: "COPY.md §1 bans marketing/onboarding CTA copy." },
  { name: "status-synonym", pattern: /\b(?:In Flight|WIP|Doing|Stuck|Done!)\b/, reason: "COPY.md §6 locks status vocabulary." },
  { name: "generic-error", pattern: /\bSomething went wrong\b|\bOops!\b|\bPlease try again\b|\bContact support\b/i, reason: "COPY.md §3 requires action-specific recovery copy." },
  { name: "first-person-plural", pattern: /\bWe (?:couldn't|can't|cannot|could not)\b/i, reason: "COPY.md §1 bans first-person plural recovery copy." },
  { name: "phase-provenance", pattern: /\b(?:wave(?:[-\s]?\d+[a-z]?)?|phase)\b/i, reason: "COPY.md §1 and AGENTS.md require responsibility/value/behavior names instead of phase or plan-provenance copy." },
];

const SOURCE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib/components",
  "apps/web/src/lib/i18n/locales",
  "apps/cli/src",
  "apps/tui/src",
  "packages/ui-kit/src",
];

const RENDERED_OUTPUT_ROOTS = [
  "tests/cli/__snapshots__",
  "tests/tui/__snapshots__",
  "apps/web/tests/__snapshots__",
  "apps/web/src/__snapshots__",
  "apps/tui/src/__snapshots__",
  "packages/ui-kit/src/__snapshots__",
];

const FILE_EXTENSIONS = new Set([".svelte", ".ts", ".tsx", ".js", ".jsx", ".json", ".snap"]);

interface Candidate {
  file: string;
  line: number;
  text: string;
  source: "source" | "rendered";
  origin: "quoted" | "template" | "svelte-text" | "rendered";
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
  for (const pattern of [/"([^"\\]*(?:\\.[^"\\]*)*)"/g, /'([^'\\]*(?:\\.[^'\\]*)*)'/g]) {
    for (const match of line.matchAll(pattern)) {
      const value = match[1].replace(/\\n/g, " ").replace(/\\"/g, "\"").replace(/\\'/g, "'");
      if (/[A-Za-z🎉✨—]/.test(value) || /\\u(?:2014|2728)/i.test(value)) out.push(value);
    }
  }
  return out;
}

function visibleTemplateText(segment: string): string {
  return segment
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findUnescapedBacktick(line: string, from: number): number {
  let index = from;
  while (index < line.length) {
    const next = line.indexOf("`", index);
    if (next === -1) return -1;
    if (next === 0 || line[next - 1] !== "\\") return next;
    index = next + 1;
  }
  return -1;
}

function templateSegments(line: string): { text: string; open: boolean }[] {
  const out: { text: string; open: boolean }[] = [];
  let index = 0;

  while (true) {
    const start = findUnescapedBacktick(line, index);
    if (start === -1) break;

    const end = findUnescapedBacktick(line, start + 1);
    if (end === -1) {
      const text = visibleTemplateText(line.slice(start + 1));
      if (text) out.push({ text, open: true });
      return out;
    }

    const text = visibleTemplateText(line.slice(start + 1, end));
    if (text) out.push({ text, open: false });
    index = end + 1;
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
  return /[A-Za-z🎉✨—]/.test(withoutTags) || /\\u(?:2014|2728)/i.test(withoutTags) ? [withoutTags] : [];
}

function bareSvelteText(line: string): string[] {
  const text = line.replace(/\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
  if (!text || !/[A-Za-z🎉✨—]/.test(text)) return [];
  if (/[<>]/.test(text) || /^data-[\w-]+$/.test(text) || /^[A-Za-z0-9_:-]+(?:=|:)/.test(text)) return [];
  if (/^(?:<\/?[A-Za-z]|[{}/:;]|#|{:|{\/)/.test(text)) return [];
  if (/^(?:const|let|type|interface|function|import|export|return|if|for|await|async)\b/.test(text)) return [];
  return [text];
}

function candidatesForFile(absPath: string, source: Candidate["source"]): Candidate[] {
  const rel = relative(repoRoot, absPath);
  const isSvelte = absPath.endsWith(".svelte");
  const lines = readFileSync(absPath, "utf8").split(/\r?\n/);
  const candidates: Candidate[] = [];
  let openTemplate = false;
  let inSvelteScript = false;
  let inSvelteStyle = false;
  let inSvelteComment = false;

  lines.forEach((raw, index) => {
    const rawTrimmed = raw.trim();
    if (isSvelte && (inSvelteComment || rawTrimmed.startsWith("<!--"))) {
      if (!rawTrimmed.includes("-->")) inSvelteComment = true;
      if (rawTrimmed.includes("-->")) inSvelteComment = false;
      return;
    }

    let line = stripInlineComment(raw);
    if (!line.trim()) return;
    const trimmed = line.trim();
    const startsSvelteScript = isSvelte && /<script\b/.test(trimmed);
    const startsSvelteStyle = isSvelte && /<style\b/.test(trimmed);
    if (startsSvelteScript) inSvelteScript = true;
    if (startsSvelteStyle) inSvelteStyle = true;
    const inSvelteMarkup = isSvelte && !inSvelteScript && !inSvelteStyle;

    if (source === "rendered") {
      candidates.push({ file: rel, line: index + 1, text: line, source, origin: "rendered" });
      return;
    }

    if (openTemplate) {
      const close = findUnescapedBacktick(line, 0);
      const segment = close === -1 ? line : line.slice(0, close);
      const text = visibleTemplateText(segment);
      if (text) candidates.push({ file: rel, line: index + 1, text, source, origin: "template" });
      if (close === -1) return;
      openTemplate = false;
      line = line.slice(close + 1);
    }

    for (const text of quotedLiterals(line)) {
      candidates.push({ file: rel, line: index + 1, text, source, origin: "quoted" });
    }
    for (const segment of templateSegments(line)) {
      candidates.push({ file: rel, line: index + 1, text: segment.text, source, origin: "template" });
      if (segment.open) openTemplate = true;
    }
    if (inSvelteMarkup) {
      for (const text of [...svelteText(line), ...bareSvelteText(line)]) {
        candidates.push({ file: rel, line: index + 1, text, source, origin: "svelte-text" });
      }
    }

    if (isSvelte && /<\/script>/.test(trimmed)) inSvelteScript = false;
    if (isSvelte && /<\/style>/.test(trimmed)) inSvelteStyle = false;
  });

  return candidates;
}

function isMachineToken(text: string): boolean {
  const value = text.trim();
  if (!value || /\s/.test(value)) return false;
  return /^[-_:./@A-Za-z0-9]+$/.test(value);
}

function isStatusBanlistFixture(candidate: Candidate, rule: BanRule): boolean {
  return (
    rule.name === "status-synonym" &&
    candidate.source === "source" &&
    candidate.origin === "quoted" &&
    /^packages\/ui-kit\/src\/components\/status-badge\/status-badge\.(?:svelte|exports\.ts)$/.test(
      candidate.file,
    ) &&
    /^(?:In Flight|WIP|Doing|Stuck|Done!)$/.test(candidate.text)
  );
}

function allowed(candidate: Candidate, rule: BanRule): boolean {
  const { file, text, source, origin } = candidate;

  // Non-visible tests may assert banned strings are absent.
  if (source === "rendered" && !file.includes("__snapshots__")) {
    if (/not\.toContain|Ban-list|banned|copy banlist|expect\(/i.test(text)) return true;
  }

  // Internal protocol/type names are allowed when they are source identifiers
  // rather than user-facing copy.
  if (rule.name === "protocol-chrome") {
    if (source === "source" && origin !== "svelte-text" && isMachineToken(text)) return true;
    if (/acp-session\.spec\.ts$/.test(file)) return true;
  }

  if (rule.name === "chat-label" && source === "source" && origin !== "svelte-text" && isMachineToken(text)) {
    return true;
  }

  if (rule.name === "phase-provenance") {
    if (source !== "source" || !/^apps\/web\/src\/routes\/.*\.svelte$/.test(file)) return true;
    if (origin !== "svelte-text" && isMachineToken(text)) return true;
    if (/=>|=|\{|\}/.test(text)) return true;
  }

  // The ui-kit status badge exports BANNED_STATUS_SYNONYMS so tests and
  // fixtures can assert those labels never render.
  if (isStatusBanlistFixture(candidate, rule)) return true;

  // The copy gate itself names banned examples so regressions are explicit.
  if (file === "scripts/check-copy-banlist.ts") return true;

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
  writeFileSync(temp, `<button>Get started</button>\n<p>Trace — Run</p>\n<p>✨ AI Assist</p>\n<p>Open chat</p>\n<p>acp session</p>\n`);
  try {
    const findings = scan(candidatesForFile(temp, "source"));
    if (!findings.some((finding) => finding.rule.name === "marketing-start")) {
      throw new Error("self-test failed: injected banned visible string was not detected");
    }
    if (!findings.some((finding) => finding.rule.name === "no-em-dash")) {
      throw new Error("self-test failed: injected visible em dash was not detected");
    }
    if (!findings.some((finding) => finding.rule.name === "no-decorative-sparkle")) {
      throw new Error("self-test failed: injected visible sparkle glyph was not detected");
    }
    if (!findings.some((finding) => finding.rule.name === "chat-label")) {
      throw new Error("self-test failed: injected visible chat label was not detected");
    }
    if (!findings.some((finding) => finding.rule.name === "protocol-chrome")) {
      throw new Error("self-test failed: injected visible acp protocol label was not detected");
    }

    const provenanceFindings = scan([
      {
        file: "apps/web/src/routes/copy-banlist-self-test/+page.svelte",
        line: 1,
        text: "Wave 0a foundation",
        source: "source",
        origin: "svelte-text",
      },
    ]);
    if (!provenanceFindings.some((finding) => finding.rule.name === "phase-provenance")) {
      throw new Error("self-test failed: injected visible phase provenance copy was not detected");
    }

    const statusFixture = resolve(
      repoRoot,
      "packages/ui-kit/src/components/status-badge/status-badge.exports.ts",
    );
    const fixtureFindings = scan(candidatesForFile(statusFixture, "source"));
    if (fixtureFindings.some((finding) => finding.rule.name === "status-synonym")) {
      throw new Error("self-test failed: BANNED_STATUS_SYNONYMS export was treated as visible copy");
    }

    const renderedStatusFindings = scan([
      {
        file: "apps/web/tests/__snapshots__/copy-banlist-self-test.snap",
        line: 1,
        text: "In Flight",
        source: "rendered",
        origin: "rendered",
      },
      {
        file: "apps/web/tests/__snapshots__/copy-banlist-self-test.snap",
        line: 2,
        text: "WIP",
        source: "rendered",
        origin: "rendered",
      },
    ]);
    if (renderedStatusFindings.filter((finding) => finding.rule.name === "status-synonym").length !== 2) {
      throw new Error("self-test failed: injected rendered status synonyms were not detected");
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
