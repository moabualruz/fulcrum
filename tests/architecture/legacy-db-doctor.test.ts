import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildProductKernelDoctorReport,
  buildReposDoctorReport,
  rebuildLocalPgliteDatabase,
} from "@platform-core/infrastructure/doctor/product-store-report.ts";
import { applyProductMigrations } from "@platform-core/infrastructure/application-database/product-migrations.ts";
import { openLocalSqlStore } from "@platform-core/infrastructure/application-database/sql.ts";

const originalFulcrumHome = process.env.FULCRUM_HOME;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalFulcrumHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = originalFulcrumHome;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("legacy DB doctor reports", () => {
  test("reports configured PostgreSQL as the selected engine and redacts its URL", async () => {
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-doctor-postgres-home-"));
    process.env.DATABASE_URL = "postgresql://fulcrum:secret@127.0.0.1:9/fulcrum";

    const report = await buildProductKernelDoctorReport();

    expect(report).toMatchObject({
      engine: "postgres",
      dbPath: "postgresql://fulcrum:***@127.0.0.1:9/fulcrum",
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
    });
    expect(report.error).toBeString();
  });

  test("reports absent pglite when the configured data directory has not been initialized", async () => {
    process.env.FULCRUM_HOME = await mkdtemp(join(tmpdir(), "fulcrum-doctor-empty-home-"));
    delete process.env.DATABASE_URL;

    const report = await buildProductKernelDoctorReport();

    expect(report.engine).toBe("absent");
    expect(report.dbPath).toBe(join(process.env.FULCRUM_HOME, "db", "main"));
    expect(report.schemaApplied).toBe(0);
    expect(report.rows).toEqual({ orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 });
    expect(report.latestEventAt).toBeNull();
  });

  test("reads migrated pglite schema counts, latest event, and repo sync stats from real tables", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-doctor-live-home-"));
    const dataDir = join(home, "db", "main");
    process.env.FULCRUM_HOME = home;
    delete process.env.DATABASE_URL;

    const db = await openLocalSqlStore(dataDir);
    try {
      const applied = await applyProductMigrations(db);
      await db.query(
        `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
        ["org-doctor", "doctor", "Doctor Org"],
      );
      await db.query(
        `INSERT INTO projects (id, org_id, slug, name) VALUES ($1, $2, $3, $4)`,
        ["project-doctor", "org-doctor", "doctor-project", "Doctor Project"],
      );
      await db.query(
        `INSERT INTO documents (id, org_id, project_id, kind, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["doc-doctor", "org-doctor", "project-doctor", "note", "Doctor Doc", "body"],
      );
      await db.query(
        `INSERT INTO tasks (id, org_id, project_id, title, status)
         VALUES ($1, $2, $3, $4, $5)`,
        ["task-doctor", "org-doctor", "project-doctor", "Doctor Task", "pending"],
      );
      await db.query(
        `INSERT INTO agent_runs (id, org_id, project_id, task_id, agent, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["run-doctor", "org-doctor", "project-doctor", "task-doctor", "codex", "queued"],
      );
      await db.query(
        `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "event-doctor",
          "org-doctor",
          "project-doctor",
          "tester",
          "task",
          "task-doctor",
          "created",
          "2026-05-12T10:00:00.000Z",
        ],
      );
      await db.query(
        `INSERT INTO repos (id, org_id, project_id, slug, root_path, sync_status, sync_error, mirror_size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "repo-doctor",
          "org-doctor",
          "project-doctor",
          "repo",
          home,
          "error",
          "remote failed",
          1_073_741_824,
        ],
      );

      const product = await buildProductKernelDoctorReport();
      const repos = await buildReposDoctorReport(product);

      expect(product.engine).toBe("pglite");
      expect(product.dbPath).toBe(dataDir);
      expect(product.schemaApplied).toBe(applied.length);
      expect(product.rows).toEqual({
        orgs: 1,
        projects: 1,
        documents: 1,
        tasks: 1,
        agentRuns: 1,
      });
      expect(new Date(product.latestEventAt as string).toISOString()).toBe("2026-05-12T10:00:00.000Z");
      expect(repos).toEqual({
        totalRepos: 1,
        syncErrors: 1,
        activeWatchers: 0,
        lruQueueDepth: 0,
        mirrorDiskGb: 1,
      });
    } finally {
      await db.close();
    }
  });

  test("repo doctor returns empty stats when product kernel is absent or errored", async () => {
    await expect(
      buildReposDoctorReport({
        engine: "absent",
        dbPath: "/missing",
        schemaApplied: 0,
        rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
        latestEventAt: null,
        error: "not available",
      }),
    ).resolves.toEqual({
      totalRepos: 0,
      syncErrors: 0,
      activeWatchers: 0,
      lruQueueDepth: 0,
      mirrorDiskGb: 0,
    });
  });

  test("reports pglite corruption with exact rebuild recovery command and rebuild quarantines old data", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-doctor-corrupt-home-"));
    const dataDir = join(home, "db", "main");
    process.env.FULCRUM_HOME = home;
    delete process.env.DATABASE_URL;

    const db = await openLocalSqlStore(dataDir);
    try {
      await applyProductMigrations(db);
      await db.exec("DROP TABLE tasks CASCADE");
    } finally {
      await db.close();
    }

    const corrupt = await buildProductKernelDoctorReport();
    expect(corrupt.engine).toBe("pglite");
    expect(corrupt.error).toContain("tasks");
    expect(corrupt.recoveryAction).toBe("pglite-rebuild");
    expect(corrupt.recoveryCommand).toBe("fulcrum doctor --run-fix=pglite-rebuild");

    const rebuilt = await rebuildLocalPgliteDatabase();
    expect(rebuilt).toMatchObject({
      action: "pglite-rebuild",
      dbPath: dataDir,
      verified: true,
    });
    expect(rebuilt.quarantinedPath).toContain(".corrupt-");

    const verified = await buildProductKernelDoctorReport();
    expect(verified.error).toBeUndefined();
    expect(verified.schemaApplied).toBeGreaterThan(0);
  });
});
