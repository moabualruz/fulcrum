import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const RAW_ENTITY_MANAGER_PATTERNS = [
  /em\.(persist|flush|execute|getConnection)/,
];

const RUNTIME_ROOTS = [
  "src/web",
  "src/cli",
  "src/tui",
  "src/router",
  "src/api",
];

const WEB_DATA_HANDLE_ROOTS = [
  "src/web/src/routes",
  "src/web/src/lib",
];

const SQL_INTERFACE_ROOTS = [
  "src/web/src/routes",
  "src/web/src/lib",
  "src/cli",
  "src/tui",
  "src/api",
  "src/router",
  "src/trpc",
  "src/server/trpc",
];

const WEB_DATA_HANDLE_PATTERN = /\b(openDatabase|getDatabase|getEm|getDefaultOrgIdOrm|ormSqlConnection|WebDatabaseHandle|LegacyDatabaseHandle|application-compat)\b/;

const RAW_SQL_CALL_PATTERN = /\b(db|conn|connection|client|pglite)\.query\(|\.execute\(/;

const WEB_DATA_HANDLE_COMPOSITION_ROOTS = new Map([
  [
    "src/web/src/lib/server/db.ts",
    "web composition root owns current database singleton until route/helper callers move behind application services",
  ],
]);

const EXPECTED_WEB_DATA_HANDLE_FILES = [
  "src/web/src/lib/server/em.ts",
  "src/web/src/lib/server/feature-flags.ts",
  "src/web/src/lib/server/orm-helpers.ts",
  "src/web/src/lib/server/projects.ts",
  "src/web/src/lib/server/settings.ts",
  "src/web/src/lib/server/skills.ts",
  "src/web/src/lib/server/sprints.ts",
  "src/web/src/lib/server/task-detail.ts",
  "src/web/src/routes/agents/+page.server.ts",
  "src/web/src/routes/agents/[name]/+page.server.ts",
  "src/web/src/routes/api/bell/+server.ts",
  "src/web/src/routes/api/data/export-csv/+server.ts",
  "src/web/src/routes/api/data/import-csv/+server.ts",
  "src/web/src/routes/api/skills/+server.ts",
  "src/web/src/routes/docs/+page.server.ts",
  "src/web/src/routes/docs/[id]/edit/+page.server.ts",
  "src/web/src/routes/memory/[id]/+page.server.ts",
  "src/web/src/routes/projects/new/+page.server.ts",
  "src/web/src/routes/runs/[id]/artifacts/+page.server.ts",
  "src/web/src/routes/search/+page.server.ts",
  "src/web/src/routes/settings/integrations/linear/+page.server.ts",
  "src/web/src/routes/settings/notifications/+page.server.ts",
  "src/web/src/routes/settings/skills/+page.server.ts",
];

const EXPECTED_RAW_SQL_CALL_FILES = [
  "src/cli/audit.ts",
  "src/cli/interactive/backup.ts",
  "src/cli/interactive/restore.ts",
  "src/router/domain-adapter.ts",
  "src/web/src/lib/server/orm-helpers.ts",
  "src/web/src/lib/server/projects.ts",
  "src/web/src/lib/server/skills.ts",
  "src/web/src/routes/docs/[id]/edit/+page.server.ts",
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

describe("Phase 9.5 raw EntityManager and SQL boundary", () => {
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
});
