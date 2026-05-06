import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const RAW_ENTITY_MANAGER_PATTERNS = [
  /em\.(persist|flush|execute|getConnection)/,
  /getConnection\(\)\.execute/,
  /\.execute\(/,
  /\.query\(/,
];

const RUNTIME_ROOTS = [
  "src/web",
  "src/cli",
  "src/tui",
  "src/router",
  "src/api",
];

function ignored(path: string): boolean {
  return (
    path.endsWith(".test.ts") ||
    path.endsWith(".spec.ts") ||
    path.includes("/__tests__/") ||
    path.includes("/tests/") ||
    path.includes("/node_modules/") ||
    path.includes("/.svelte-kit/") ||
    path.includes("src/db/migrations/")
  );
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (ignored(path)) return [];
    return [path];
  }));
  return files.flat();
}

async function rawEntityManagerViolations(): Promise<string[]> {
  const files = (await Promise.all(RUNTIME_ROOTS.map(collectSourceFiles))).flat();
  const found: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!RAW_ENTITY_MANAGER_PATTERNS.some((pattern) => pattern.test(line))) return;
      found.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
    });
  }

  return found.sort();
}

describe("Phase 9.5 raw EntityManager and SQL boundary", () => {
  test("interface/runtime code does not use raw EntityManager or SQL execution", async () => {
    const found = await rawEntityManagerViolations();
    expect(found).toEqual([]);
  });
});
