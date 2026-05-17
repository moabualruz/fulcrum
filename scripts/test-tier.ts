#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type TestTier = "unit" | "integration";

const tier = process.argv[2] as TestTier | undefined;
if (tier !== "unit" && tier !== "integration") {
  console.error("usage: bun run scripts/test-tier.ts <unit|integration> [--list] [bun test flags...]");
  process.exit(2);
}

const args = process.argv.slice(3);
const listOnly = args.includes("--list");
const passthrough = args.filter((arg) => arg !== "--list");

const dbContractMarkers =
  /@electric-sql\/pglite|pglite|PGlite|createTestDb|createTypeOrmTestDataSource|temporary-postgres|TemporaryPostgres|PostgreSQL|FULCRUM_DATABASE_URL|DATABASE_URL|DataSource|TypeORM|TypeOrmModule|typeorm|runMigrations|openPglite|openProductDb|real database|\.query\(/;

function walk(root: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else if (/\.(test|spec)\.ts$/.test(path)) entries.push(path);
  }
  return entries;
}

function isArchitectureTest(path: string): boolean {
  return path.startsWith("tests/architecture/");
}

function isServiceIntegrationContract(path: string): boolean {
  if (!path.startsWith("services/")) return false;
  if (path.includes(".integration.test.") || path.includes(".persistence.test.")) return true;
  if (path.includes("-persistence.test.") || path.includes("/persistence.test.")) return true;
  if (path.includes("/infrastructure/")) return true;
  const text = readFileSync(path, "utf8");
  return dbContractMarkers.test(text);
}

function selectedFiles(testTier: TestTier): string[] {
  const serviceTests = walk("services");
  if (testTier === "unit") {
    return serviceTests.filter((path) => !isServiceIntegrationContract(path)).sort();
  }

  return [
    ...walk("tests").filter((path) => !isArchitectureTest(path)),
    ...serviceTests.filter(isServiceIntegrationContract),
  ].sort();
}

const files = selectedFiles(tier);

if (listOnly) {
  console.log(JSON.stringify({ tier, count: files.length, files }, null, 2));
  process.exit(0);
}

if (files.length === 0) process.exit(0);

const proc = Bun.spawn(["bun", "test", ...passthrough, ...files], {
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(await proc.exited);
