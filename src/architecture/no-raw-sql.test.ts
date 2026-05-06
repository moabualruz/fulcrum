import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const RAW_SQL_PATTERNS = [/\.execute\(/, /\.query\(/];
const ROOTS = [
  "src/cli",
  "src/tui",
  "src/router",
  "src/api",
  "src/search",
  "src/docs",
  "src/collab",
  "src/connectors",
  "src/doctor/checks",
  "src/orchestration/symphony",
  "src/services",
];

const EXACT_RAW_SQL_ALLOWLIST = [
  "src/api/routes/search.ts",
  "src/cli/audit.ts",
  "src/cli/commands/pillar14-generated.ts",
  "src/cli/commands/search.ts",
  "src/cli/interactive/backup.ts",
  "src/cli/interactive/restore.ts",
  "src/cli/product.ts",
  "src/search/click-telemetry.ts",
  "src/search/indexers/base.ts",
  "src/search/query.ts",
  "src/docs/doc-embedder.ts",
  "src/docs/search-indexer.ts",
  "src/collab/server.ts",
  "src/connectors/framework.ts",
  "src/router/domain-adapter.ts",
  "src/services/AutomationService.ts",
  "src/services/SprintService.ts",
  "src/services/TaskService.ts",
  "src/services/tasks.ts",
  "src/services/runs.ts",
  "../test-support/product-fixtures.ts",
  "src/tui/index.ts",
  "src/tui/screens/activity.ts",
  "src/tui/screens/audit.ts",
  "src/tui/screens/search-screen.ts",
  "src/tui/screens/search.ts",
] as const;

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
    if (path.includes("../test-support/product-fixtures.ts")) return [];
    return [path];
  }));
  return files.flat();
}

async function rawSqlViolations(): Promise<string[]> {
  const files = (await Promise.all(ROOTS.map(collectSourceFiles))).flat();
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
  test("interface code avoids .execute( and .query( raw SQL calls", async () => {
    const found = await rawSqlViolations();
    const allowed = new Set(EXACT_RAW_SQL_ALLOWLIST);
    expect(found.filter((file) => !allowed.has(file))).toEqual([]);
  });

  test("non-web raw SQL compatibility allowlist is exact and categorized", () => {
    expect(EXACT_RAW_SQL_ALLOWLIST).toEqual([
      "src/api/routes/search.ts",
      "src/cli/audit.ts",
      "src/cli/commands/pillar14-generated.ts",
      "src/cli/commands/search.ts",
      "src/cli/interactive/backup.ts",
      "src/cli/interactive/restore.ts",
      "src/cli/product.ts",
      "src/search/click-telemetry.ts",
      "src/search/indexers/base.ts",
      "src/search/query.ts",
      "src/docs/doc-embedder.ts",
      "src/docs/search-indexer.ts",
      "src/collab/server.ts",
      "src/connectors/framework.ts",
      "src/router/domain-adapter.ts",
      "src/services/AutomationService.ts",
      "src/services/SprintService.ts",
      "src/services/TaskService.ts",
      "src/services/tasks.ts",
      "src/services/runs.ts",
      "../test-support/product-fixtures.ts",
      "src/tui/index.ts",
      "src/tui/screens/activity.ts",
      "src/tui/screens/audit.ts",
      "src/tui/screens/search-screen.ts",
      "src/tui/screens/search.ts",
    ]);
  });
});
