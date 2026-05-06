import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const RAW_SQL_PATTERNS = [/\.execute\(/, /\.query\(/];

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    if (path.includes("src/db/migrations/")) return [];
    if (path.includes("src/product-kernel/db/migrations/")) return [];
    return [path];
  }));
  return files.flat();
}

async function rawSqlViolations(): Promise<string[]> {
  const files = await collectSourceFiles("src");
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (RAW_SQL_PATTERNS.some((pattern) => pattern.test(text))) {
      found.push(relative(process.cwd(), file));
    }
  }
  return found.sort();
}

describe("Phase 9.5 raw SQL boundary", () => {
  test("application and interface code avoids .execute( and .query( raw SQL calls", async () => {
    expect(await rawSqlViolations()).toEqual([]);
  });
});
