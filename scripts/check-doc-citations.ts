import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copyPath = resolve(repoRoot, "COPY.md");
const defaultTargets = [
  ".scratch/design-fidelity-review-2026-05-20/design-alignment/plan.md",
];

function headingSections(markdown: string): Set<string> {
  const sections = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(\d+(?:\.\d+)*)\b/);
    if (match) sections.add(match[1]);
  }
  return sections;
}

function formatPath(path: string): string {
  return relative(repoRoot, path) || path;
}

const validCopySections = headingSections(readFileSync(copyPath, "utf8"));
const targets = process.argv.slice(2);
const paths = (targets.length > 0 ? targets : defaultTargets).map((target) =>
  resolve(repoRoot, target),
);
const failures: string[] = [];

for (const path of paths) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/COPY\.md §(\d+(?:\.\d+)*)/g)) {
      const section = match[1];
      if (!validCopySections.has(section)) {
        failures.push(
          `${formatPath(path)}:${index + 1}: COPY.md §${section} is not a COPY.md heading; use a stable section such as COPY.md §14.2 or a named source note.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `check-doc-citations ok: ${paths.length} file(s), ${validCopySections.size} COPY.md heading(s)`,
);
