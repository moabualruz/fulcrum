#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const specPath = join(process.cwd(), "vendor/openai-symphony/SPEC.md");
const tracePath = join(process.cwd(), "docs/symphony-conformance.md");

export function requiredConformanceItems(specText: string): string[] {
  const lines = specText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "### 18.1 REQUIRED for Conformance");
  if (start === -1) {
    throw new Error("SPEC.md missing 18.1 REQUIRED for Conformance checklist");
  }

  const items: string[] = [];
  let current: string[] | undefined;

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("### ")) {
      break;
    }

    if (line.startsWith("- ")) {
      if (current) {
        items.push(current.join(" ").replace(/\s+/g, " "));
      }
      current = [line.slice(2).trim()];
      continue;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.push(line.trim());
    }
  }

  if (current) {
    items.push(current.join(" ").replace(/\s+/g, " "));
  }

  if (items.length === 0) {
    throw new Error("SPEC.md 18.1 checklist has no REQUIRED items");
  }

  return items;
}

export function renderTrace(items: string[]): string {
  return [
    "# Symphony Conformance Trace",
    "",
    "Source: `vendor/openai-symphony/SPEC.md`",
    "Lock: `.symphony-spec.lock`",
    "",
    "## 18.1 REQUIRED for Conformance",
    "",
    ...items.flatMap((item) => [`### ${item}`, ""]),
  ].join("\n");
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const output = renderTrace(requiredConformanceItems(readFileSync(specPath, "utf8")));

  if (args.has("--write")) {
    writeFileSync(tracePath, output);
    return;
  }

  if (args.has("--check")) {
    if (!existsSync(tracePath) || readFileSync(tracePath, "utf8") !== output) {
      throw new Error("docs/symphony-conformance.md is stale; run: bun run scripts/gen-conformance-trace.ts --write");
    }
    return;
  }

  process.stdout.write(output);
}

if (import.meta.main) {
  main();
}
