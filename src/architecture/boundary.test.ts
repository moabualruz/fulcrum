import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOTS = [
  "src/web/src/routes",
  "src/cli",
  "src/tui",
  "src/api",
  "src/router",
  "src/server/trpc",
];

const FORBIDDEN_INTERFACE_ACCESS =
  /\b(openPglite|openProductDb|getProductDb|ProductDb)\b|from\s+["'][^"']*product-kernel[^"']*["']/;

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.includes("/__tests__/")) return [];
    return [path];
  }));
  return files.flat();
}

async function violations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("Phase 9.5 interface boundary", () => {
  test("interfaces do not import product-kernel or open ProductDb/PGlite directly", async () => {
    expect(await violations(ROOTS, FORBIDDEN_INTERFACE_ACCESS)).toEqual([]);
  });

  test("R-11 subscriptions do not import or depend on PGlite/pglite directly", async () => {
    expect(await violations(["src/subscriptions"], /\bPGlite\b|\bpglite\b/)).toEqual([]);
  });
});
