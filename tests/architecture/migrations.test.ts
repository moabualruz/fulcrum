import { access, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const PRODUCT_KERNEL_MIGRATION_PATTERN =
  /migrateIsolatedStore|from\s+["'][^"']*product-kernel\/db\/migrate[^"']*["']/;
const PRODUCT_STORE_MIGRATION_RUNNER_PATH = "services/platform-core/src/infrastructure/product-store/db/migrate.ts";
const LEGACY_PRODUCT_STORE_MIGRATION_IMPORT_PATTERN =
  /from\s+["'][^"']*product-store\/db\/migrate[^"']*["']|loadStoreModule\(["']db\/migrate["']\)/;
const PRODUCT_MIGRATION_BRIDGE_IMPORT_PATTERN =
  /from\s+["'][^"']*application-database\/product-migrations[^"']*["']/;
const PRODUCT_MIGRATION_BRIDGE_ALLOWED_IMPORTERS = [
  "services/platform-core/src/infrastructure/doctor/product-store-report.ts",
  "scripts/seed-search-test-data.ts",
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
    return [path];
  }));
  return files.flat();
}

async function migrationViolations(): Promise<string[]> {
  const files = (await Promise.all(["apps", "services", "scripts"].map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (PRODUCT_KERNEL_MIGRATION_PATTERN.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function productStoreMigrationRunnerImportViolations(): Promise<string[]> {
  const files = (await Promise.all(["apps", "services", "scripts", "tests/support"].map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    const text = await readFile(file, "utf8");
    if (LEGACY_PRODUCT_STORE_MIGRATION_IMPORT_PATTERN.test(text)) found.push(relativePath);
  }
  return found.sort();
}

async function applicationLayerProductMigrationBridgeViolations(): Promise<string[]> {
  const files = (await Promise.all(["apps", "services", "scripts"].map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    if ((PRODUCT_MIGRATION_BRIDGE_ALLOWED_IMPORTERS as readonly string[]).includes(relativePath)) continue;
    const text = await readFile(file, "utf8");
    if (PRODUCT_MIGRATION_BRIDGE_IMPORT_PATTERN.test(text)) found.push(relativePath);
  }
  return found.sort();
}

async function trackedSqlFileViolations(root = process.cwd()): Promise<string[]> {
  const ignoredSegments = new Set([
    ".git",
    ".claude",
    ".scratch",
    ".svelte-kit",
    "dist",
    "graphify-out",
    "node_modules",
    "target",
  ]);
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignoredSegments.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && path.endsWith(".sql")) {
        files.push(relative(root, path));
      }
    }
  }

  await walk(root);
  return files.sort();
}

describe("interface migration authority", () => {
  test("runtime code does not import or call product-kernel migrateIsolatedStore", async () => {
    expect(await migrationViolations()).toEqual([]);
  });

  test("product-store migrations have one runtime bridge instead of a duplicate runner", async () => {
    expect(await fileExists(PRODUCT_STORE_MIGRATION_RUNNER_PATH)).toBe(false);
    expect(await productStoreMigrationRunnerImportViolations()).toEqual([]);
    expect(await applicationLayerProductMigrationBridgeViolations()).toEqual([]);
  });

  test("tracked migrations are executable TypeScript modules instead of raw sql files", async () => {
    await expect(trackedSqlFileViolations()).resolves.toEqual([]);
  });
});
