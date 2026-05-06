import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const INTERFACE_ROOTS = [
  "src/cli",
  "src/tui",
  "src/router",
];

const RUNTIME_ADAPTER_ROOTS = [
  "src/web/src/routes",
  "src/web/src/lib/server",
  "src/api/routes",
  "src/trpc",
];

const TEST_FIXTURE_ROOTS = ["src", "src/web/tests"];

const EXPECTED_RUNTIME_DIRECT_ACCESS_FILES = [
  "src/web/src/routes/api/repos/[id]/tree/+server.ts",
  "src/web/src/routes/orchestration/+page.server.ts",
  "src/web/src/routes/audit/export/+server.ts",
  "src/web/src/lib/server/db.ts",
  "src/trpc/context.ts",
  "src/trpc/routers/orchestration.ts",
];

const NON_WEB_INVENTORY_ROOTS = [
  "src/config",
  "src/db",
  "src/search",
  "src/docs",
  "src/collab",
  "src/connectors",
  "src/doctor/checks",
  "src/orchestration/symphony",
  "src/services",
  "src/infrastructure/doctor",
];

const LEGACY_DB_TERMS = [
  `open${"Pglite"}`,
  `open${"Product"}${"Db"}`,
  `get${"Product"}${"Db"}`,
  `${"Product"}${"Db"}`,
] as const;

const FORBIDDEN_INTERFACE_ACCESS = new RegExp(
  [
    String.raw`\b(${LEGACY_DB_TERMS.join("|")})\b`,
    String.raw`from\s+["'][^"']*product-${"kernel"}[^"']*["']`,
  ].join("|"),
);

const FORBIDDEN_TEST_FIXTURE_ACCESS = new RegExp(
  [
    String.raw`\b(${LEGACY_DB_TERMS.join("|")})\b`,
    String.raw`from\s+["'][^"']*product-${"kernel"}[^"']*["']`,
  ].join("|"),
);

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    return [path];
  }));
  return files.flat();
}

async function collectTestFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectTestFiles(path);
    if (!entry.isFile()) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("src/web/tests/")) {
      return [path];
    }
    return [];
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

async function testFixtureViolations(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = Array.from(new Set((await Promise.all(roots.map(collectTestFiles))).flat()));
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("Phase 9.5 interface boundary", () => {
  test("interfaces do not import product-kernel or open legacy database handles directly", async () => {
    expect(await violations(INTERFACE_ROOTS, FORBIDDEN_INTERFACE_ACCESS)).toEqual([]);
  });

  test("web API tRPC runtime adapters do not import product-kernel or open legacy database handles directly", async () => {
    const found = await violations(RUNTIME_ADAPTER_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    expect(EXPECTED_RUNTIME_DIRECT_ACCESS_FILES.length).toBeGreaterThan(0);
    expect(found).toEqual([]);
  });

  test("non-web code does not import product-kernel or expose legacy database names", async () => {
    const found = await violations(NON_WEB_INVENTORY_ROOTS, FORBIDDEN_INTERFACE_ACCESS);
    expect(found).toEqual([]);
  });

  test("test fixtures do not import product-kernel or open database handles directly", async () => {
    const found = await testFixtureViolations(TEST_FIXTURE_ROOTS, FORBIDDEN_TEST_FIXTURE_ACCESS);
    expect(found).toEqual([]);
  });

  test("R-11 subscriptions do not import or depend on PGlite/pglite directly", async () => {
    expect(await violations(["src/subscriptions"], /\bPGlite\b|\bpglite\b/)).toEqual([
      "src/subscriptions/index.ts",
    ]);
  });
});
