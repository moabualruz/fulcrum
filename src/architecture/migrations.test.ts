import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const PRODUCT_KERNEL_MIGRATION_PATTERN =
  /migrateIsolatedStore|from\s+["'][^"']*product-kernel\/db\/migrate[^"']*["']/;

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    if (path === "src/test-support/product-fixtures.ts") return [];
    return [path];
  }));
  return files.flat();
}

async function migrationViolations(): Promise<string[]> {
  const files = await collectSourceFiles("src");
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (PRODUCT_KERNEL_MIGRATION_PATTERN.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("Phase 9.5 migration authority", () => {
  test("runtime code does not import or call product-kernel migrateIsolatedStore", async () => {
    expect(await migrationViolations()).toEqual([]);
  });
});
