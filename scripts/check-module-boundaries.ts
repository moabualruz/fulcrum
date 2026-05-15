#!/usr/bin/env bun
/**
 * Module-boundary lint: enforces layering rules.
 *
 * Rules:
 *   1. product-store infrastructure never imports from web app
 *   2. CLI app never imports from web app
 *   3. services never import from web app
 *
 * Usage: bun run scripts/check-module-boundaries.ts
 * Exit code 0 = clean, 1 = violations found.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_ROOTS = ["apps", "services"];

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

const RULES: Array<{
  /** Glob-like prefix of source files to check */
  sourcePrefix: string;
  /** Forbidden import path substrings */
  forbiddenImports: string[];
  /** Human-readable rule name */
  rule: string;
}> = [
  {
    sourcePrefix: "services/platform-core/src/infrastructure/product-store/",
    forbiddenImports: ["/apps/web/", "@fulcrum/web/"],
    rule: "product store infrastructure must not import from web layer",
  },
  {
    sourcePrefix: "apps/cli/src/",
    forbiddenImports: ["/apps/web/", "@fulcrum/web/"],
    rule: "CLI must not import from web layer",
  },
  {
    sourcePrefix: "apps/tui/src/",
    forbiddenImports: ["/apps/web/", "@fulcrum/web/"],
    rule: "TUI must not import from web layer",
  },
  {
    sourcePrefix: "services/",
    forbiddenImports: ["/apps/web/", "@fulcrum/web/"],
    rule: "services must not import from web layer",
  },
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".svelte-kit" || entry === "dist" || entry === "graphify-out") continue;
      files.push(...walk(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const violations: Violation[] = [];
const allFiles = SOURCE_ROOTS.flatMap((sourceRoot) => walk(join(ROOT, sourceRoot)));

for (const file of allFiles) {
  const rel = relative(ROOT, file);
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");

  for (const rule of RULES) {
    if (!rel.startsWith(rule.sourcePrefix)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Match import/export from statements
      if (
        (line.includes("import ") || line.includes("export ")) &&
        line.includes("from ") &&
        rule.forbiddenImports.some((forbiddenImport) => line.includes(forbiddenImport))
      ) {
        violations.push({
          file: rel,
          line: i + 1,
          text: line.trim(),
          rule: rule.rule,
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("module boundaries: OK (0 violations)");
  process.exit(0);
} else {
  console.error(`module boundaries: ${violations.length} violation(s) found\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    rule: ${v.rule}`);
    console.error(`    ${v.text}\n`);
  }
  process.exit(1);
}
