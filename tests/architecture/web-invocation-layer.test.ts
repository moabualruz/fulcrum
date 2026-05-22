import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const WEB_SOURCE_ROOT = "apps/web/src";
const RETIRED_STUBS = new Set([
  "apps/web/src/lib/server/application-scope.ts",
  "apps/web/src/lib/server/db.ts",
  "apps/web/src/lib/server/request-service-scope.ts",
]);

const WEB_DB_PATTERNS = [
  /\$lib\/server\/(?:request-service-scope|application-scope|db)/,
  /\b(?:requestServiceScope|requestAppScope|initDatabase|getDatabase)\b/,
  /from\s+["']typeorm["']/,
  /@platform-core\/application\/runtime\/(?:local-database|application-scope)\.ts/,
  /@platform-core\/infrastructure\/(?:application-database|database\/typeorm)/,
] as const;

describe("web invocation layer", () => {
  test("web runtime files cannot import or call in-process DB plumbing", async () => {
    expect(await webDbImportViolations()).toEqual([]);
  });
});

async function webDbImportViolations(): Promise<string[]> {
  const files = await sourceFiles(WEB_SOURCE_ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const text = await readFile(join(ROOT, file), "utf8");
    const patterns = RETIRED_STUBS.has(file)
      ? WEB_DB_PATTERNS.filter((pattern) => pattern !== WEB_DB_PATTERNS[1])
      : WEB_DB_PATTERNS;
    if (patterns.some((pattern) => pattern.test(text))) {
      violations.push(file);
    }
  }

  return violations.sort();
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, root), { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        if (path === "apps/web/src/lib/test") return [];
        return await sourceFiles(path);
      }
      if (!entry.isFile()) return [];
      if (!/\.(ts|svelte)$/.test(entry.name)) return [];
      if (entry.name.endsWith(".test.ts")) return [];
      return [path];
    }),
  );
  return files.flat().map((file) => relative(ROOT, join(ROOT, file)));
}
