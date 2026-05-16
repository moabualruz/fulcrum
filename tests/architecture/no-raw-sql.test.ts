import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const RAW_ENTITY_MANAGER_PATTERNS = [
  /em\.(persist|flush|execute|getConnection)/,
];

const RUNTIME_ROOTS = [
  "apps/web",
  "apps/cli/src",
  "apps/tui/src",
  "apps/server/src/router",
  "apps/server/src/api",
];

const WEB_DATA_HANDLE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib",
];

const SQL_INTERFACE_ROOTS = [
  "apps/web/src/routes",
  "apps/web/src/lib",
  "apps/cli/src",
  "apps/tui/src",
  "apps/server/src/api",
  "apps/server/src/router",
  "apps/server/src/trpc",
  "apps/server/src/trpc",
];

const WEB_DATA_HANDLE_PATTERN = /\b(openDatabase|getDatabase|getEm|getDefaultOrgIdOrm|ormSqlConnection|WebDatabaseHandle|LegacyDatabaseHandle|application-compat)\b/;

const RAW_SQL_CALL_PATTERN = /\b(db|conn|connection|pglite)\.query\s*(?:<[^>]+>)?\(|\b(db|conn|connection|client|pglite)\.execute\s*(?:<[^>]+>)?\(|\.getKysely\b/;

const INVOCATION_LAYER_ORM_PATTERN = /@mikro-orm|MikroORM|EntityManager|ENTITY_MANAGER_TOKEN|registerDbBindings|application-database/;

const WEB_DATA_HANDLE_COMPOSITION_ROOTS = new Map([
  [
    "apps/web/src/lib/server/db.ts",
    "web composition root owns current database singleton until route/helper callers move behind application services",
  ],
]);

const EXPECTED_WEB_DATA_HANDLE_FILES: string[] = [];

const EXPECTED_RAW_SQL_CALL_FILES: string[] = [];

function ignored(path: string): boolean {
  return (
    path.endsWith(".test.ts") ||
    path.endsWith(".spec.ts") ||
    path.includes("/__tests__/") ||
    path.includes("/tests/") ||
    path.includes("/node_modules/") ||
    path.includes("/.svelte-kit/") ||
    path.includes("services/platform-core/src/infrastructure/application-database/migrations/")
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

async function pathViolations(roots: readonly string[], pattern: RegExp, allowedPaths = new Map<string, string>()): Promise<string[]> {
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const found: string[] = [];

  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    if (allowedPaths.has(relativePath)) continue;
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relativePath);
  }

  return Array.from(new Set(found)).sort();
}

describe("interface raw EntityManager and SQL boundary", () => {
  test("interface/runtime code does not use raw EntityManager access", async () => {
    const found = await rawEntityManagerViolations();
    expect(found).toEqual([]);
  });

  test("web routes and helpers do not use data-handle aliases outside composition roots", async () => {
    const found = await pathViolations(WEB_DATA_HANDLE_ROOTS, WEB_DATA_HANDLE_PATTERN, WEB_DATA_HANDLE_COMPOSITION_ROOTS);
    expect(WEB_DATA_HANDLE_COMPOSITION_ROOTS.size).toBe(1);
    expect(found).toEqual(EXPECTED_WEB_DATA_HANDLE_FILES);
  });

  test("interface roots do not use raw query or execute calls", async () => {
    const found = await pathViolations(SQL_INTERFACE_ROOTS, RAW_SQL_CALL_PATTERN, WEB_DATA_HANDLE_COMPOSITION_ROOTS);
    expect(found).toEqual(EXPECTED_RAW_SQL_CALL_FILES);
  });

  test("web CLI and TUI invocation layers do not reference ORM internals", async () => {
    const found = await pathViolations(
      ["apps/web/src/routes", "apps/web/src/lib", "apps/cli/src", "apps/tui/src"],
      INVOCATION_LAYER_ORM_PATTERN,
    );
    expect(found).toEqual([
      "apps/cli/src/commands/db.ts",
    ]);
  });
});
