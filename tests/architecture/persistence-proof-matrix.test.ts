import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

const PERSISTED_PUBLIC_API_MATRIX = [
  "services/execution-orchestration/src/interface/http/agent-run-public-api.persistence.test.ts",
  "services/feature-flags/src/interface/http/controllers/feature-flag-public-api.persistence.test.ts",
  "services/identity-access/src/interface/http/auth-public-api.controller.test.ts",
  "services/identity-access/src/interface/http/invitation-public-api.controller.test.ts",
  "services/identity-access/src/interface/http/organization-public-api.controller.test.ts",
  "services/integration-hub/src/interface/http/connector-public-api.persistence.test.ts",
  "services/integration-hub/src/interface/http/repository-public-api.persistence.test.ts",
  "services/integration-hub/src/interface/http/webhook-public-api.persistence.test.ts",
  "services/knowledge-workspace/src/interface/http/document-public-api.persistence.test.ts",
  "services/knowledge-workspace/src/interface/http/memory-public-api.persistence.test.ts",
  "services/knowledge-workspace/src/interface/http/search-public-api.persistence.test.ts",
  "services/notification-center/src/interface/http/notification-public-api.persistence.test.ts",
  "services/platform-core/src/interface/http/theme-settings.persistence.test.ts",
  "services/work-management/src/interface/http/automation-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/planning-structure-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/project-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/report-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/saved-view-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/sprint-public-api.persistence.test.ts",
  "services/work-management/src/interface/http/task-public-api.persistence.test.ts",
  "services/workflow-coordination/src/interface/http/artifact-public-api.persistence.test.ts",
  "services/workflow-coordination/src/interface/http/audit-public-api.persistence.test.ts",
] as const;

const CRITICAL_MIGRATION_PGLITE_PROOFS = [
  "services/execution-orchestration/src/infrastructure/database/run-context.migration.test.ts",
  "services/knowledge-workspace/src/infrastructure/database/document.migration.test.ts",
  "services/planning-review/src/infrastructure/database/review-workflow.migration.test.ts",
  "services/work-management/src/infrastructure/database/work-structure.migration.test.ts",
  "services/workflow-coordination/src/infrastructure/database/workflow-spine.migration.test.ts",
] as const;

const CRITICAL_POSTGRES_PROOFS = [
  "services/platform-core/src/infrastructure/database/typeorm-postgres.migration.test.ts",
] as const;

const CRITICAL_WORKFLOW_PGLITE_PROOFS = [
  "tests/e2e/workflow-end-to-end.test.ts",
] as const;

const DB_BACKED_TEST_CLASSIFICATIONS = [
  /\.integration\.test\.ts$/,
  /\.persistence\.test\.ts$/,
  /\.migration\.test\.ts$/,
  /\/infrastructure\/(?:application-database|database|product-store)\//,
  /\/interface\/http\/.*controller\.test\.ts$/,
  /\/application\/db\//,
  /\/application\/health-checks\/checks\/database\.test\.ts$/,
  /\/application\/settings\/settings\.integration\.test\.ts$/,
  /\/application\/skill-supply\/marketplace-publisher\.test\.ts$/,
  /\/application\/memory\/__tests__\//,
  /\/application\/search\/query-service\.test\.ts$/,
  /\/application\/docs\/doc-embedder\.test\.ts$/,
  /\/application\/agents\/queries\.integration\.test\.ts$/,
  /\/application\/outbox\.test\.ts$/,
] as const;

async function exists(path: string): Promise<boolean> {
  return stat(join(ROOT, path)).then(() => true, () => false);
}

async function read(path: string): Promise<string> {
  return readFile(join(ROOT, path), "utf8");
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, root), { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (entry.isFile() && path.endsWith(".test.ts")) return [path];
    return [];
  }));
  return files.flat();
}

describe("persistence proof matrix", () => {
  test("persisted public API families declare PGlite and PostgreSQL coverage", async () => {
    const missing: string[] = [];
    const incomplete: string[] = [];

    for (const file of PERSISTED_PUBLIC_API_MATRIX) {
      if (!await exists(file)) {
        missing.push(file);
        continue;
      }
      const text = await read(file);
      if (!text.includes("PGlite") || !text.includes("pglite-socket")) incomplete.push(`${file}:missing-pglite-proof`);
      if (!text.includes("startTemporaryPostgres") || !text.includes("real PostgreSQL")) {
        incomplete.push(`${file}:missing-postgres-proof`);
      }
    }

    expect(missing).toEqual([]);
    expect(incomplete).toEqual([]);
  });

  test("critical migration and workflow paths have explicit dialect proof", async () => {
    const incomplete: string[] = [];

    for (const file of CRITICAL_MIGRATION_PGLITE_PROOFS) {
      const text = await read(file);
      if (!text.includes("PGlite") || !text.includes("pglite-socket")) incomplete.push(`${file}:missing-pglite-migration-proof`);
    }
    for (const file of CRITICAL_POSTGRES_PROOFS) {
      const text = await read(file);
      if (!text.includes("startTemporaryPostgres") && !text.includes("PostgreSQL")) {
        incomplete.push(`${file}:missing-postgres-critical-proof`);
      }
    }
    for (const file of CRITICAL_WORKFLOW_PGLITE_PROOFS) {
      const text = await read(file);
      if (!text.includes("PGlite") || !text.includes("PGLiteSocketServer")) {
        incomplete.push(`${file}:missing-real-data-pglite-proof`);
      }
    }

    expect(incomplete).toEqual([]);
  });

  test("database-backed service tests are named or inventoried as persistence behavior", async () => {
    const serviceTests = await sourceFiles("services");
    const dbBacked: string[] = [];

    for (const file of serviceTests) {
      const text = await read(file);
      if (/\b(?:PGlite|PGLiteSocketServer|startTemporaryPostgres|PGliteDriver)\b/.test(text)) {
        dbBacked.push(relative(ROOT, join(ROOT, file)));
      }
    }

    const classified = new Set<string>([
      ...PERSISTED_PUBLIC_API_MATRIX,
      ...CRITICAL_MIGRATION_PGLITE_PROOFS,
      ...CRITICAL_POSTGRES_PROOFS,
      ...CRITICAL_WORKFLOW_PGLITE_PROOFS,
    ]);
    const unclassified = dbBacked.filter((file) => {
      if (classified.has(file)) return false;
      return !DB_BACKED_TEST_CLASSIFICATIONS.some((pattern) => pattern.test(file));
    });

    expect(unclassified.sort()).toEqual([]);
  });

  test("PGlite fixture schema patches are documented as test-harness-only behavior", async () => {
    const text = await read("tests/support/application-database.ts");

    expect(text).toContain("Singleton PGlite DataSource");
    expect(text).toContain("Patch em.update");
    expect(text).toContain("Patch em.delete");
    expect(text).toContain("PGlite doesn't return affected count");
  });
});
