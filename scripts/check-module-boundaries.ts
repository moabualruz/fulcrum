#!/usr/bin/env bun
/**
 * Module-boundary lint: enforces layering rules.
 *
 * Rules:
 *   1. product-kernel/ never imports from web/
 *   2. cli/ never imports from web/
 *   3. services/ never imports from web/
 *   4. Dependency direction: web -> services -> product-kernel
 *
 * Usage: bun run scripts/check-module-boundaries.ts
 * Exit code 0 = clean, 1 = violations found.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "src");

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

const RULES: Array<{
  /** Glob-like prefix of source files to check */
  sourcePrefix: string;
  /** Forbidden import path substring */
  forbiddenImport: string;
  /** Human-readable rule name */
  rule: string;
}> = [
  {
    sourcePrefix: "product-kernel/",
    forbiddenImport: "/web/",
    rule: "product-kernel must not import from web layer",
  },
  {
    sourcePrefix: "cli/",
    forbiddenImport: "/web/",
    rule: "CLI must not import from web layer",
  },
  {
    sourcePrefix: "services/",
    forbiddenImport: "/web/",
    rule: "services must not import from web layer",
  },
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules, .svelte-kit, dist
      if (entry === "node_modules" || entry === ".svelte-kit" || entry === "dist") continue;
      files.push(...walk(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const violations: Violation[] = [];
const allFiles = walk(ROOT);

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
        line.includes(rule.forbiddenImport)
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
