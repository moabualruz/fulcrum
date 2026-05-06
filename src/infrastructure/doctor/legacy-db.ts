import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveDatabaseConfig } from "../../config/database.ts";
import { applyProductMigrations } from "../../db/product-migrations.ts";
import { openLocalSqlStore, type SqlExecutor } from "../../db/sql.ts";

export type CheckStatus = "ok" | "warning" | "error" | "disabled";

export interface SubsystemCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface MemoryDoctorReport {
  checks: SubsystemCheck[];
}

export interface ProductKernelDoctorReport {
  engine: "pglite" | "postgres" | "absent";
  dbPath: string;
  schemaApplied: number;
  rows: {
    orgs: number;
    projects: number;
    documents: number;
    tasks: number;
    agentRuns: number;
  };
  latestEventAt: string | null;
  error?: string;
}

export interface ReposDoctorReport {
  totalRepos: number;
  syncErrors: number;
  activeWatchers: number;
  lruQueueDepth: number;
  mirrorDiskGb: number;
}

export async function buildProductKernelDoctorReport(): Promise<ProductKernelDoctorReport> {
  const config = resolveDatabaseConfig();
  if (config.backend !== "pglite") {
    return {
      engine: "absent",
      dbPath: config.url,
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
    };
  }
  const dbPath = config.dataDir;
  const exists = await Bun.file(`${dbPath}/PG_VERSION`).exists();
  if (!exists) {
    return {
      engine: "absent",
      dbPath,
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
    };
  }
  try {
    const db = await openLocalSqlStore(dbPath);
    try {
      const schemaRows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'schema_migrations' AND relkind = 'r'`,
      );
      if ((schemaRows[0]?.count ?? 0) === 0) {
        return {
          engine: "pglite",
          dbPath,
          schemaApplied: 0,
          rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
          latestEventAt: null,
        };
      }
      const applied = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM schema_migrations`,
      );
      const counts = await db.query<{
        orgs: number;
        projects: number;
        documents: number;
        tasks: number;
        agent_runs: number;
      }>(
        `SELECT (SELECT COUNT(*)::int FROM orgs) AS orgs,
                (SELECT COUNT(*)::int FROM projects) AS projects,
                (SELECT COUNT(*)::int FROM documents) AS documents,
                (SELECT COUNT(*)::int FROM tasks) AS tasks,
                (SELECT COUNT(*)::int FROM agent_runs) AS agent_runs`,
      );
      const latest = await db.query<{ created_at: string | null }>(
        `SELECT created_at FROM events ORDER BY created_at DESC, id DESC LIMIT 1`,
      );
      return {
        engine: "pglite",
        dbPath,
        schemaApplied: applied[0]?.count ?? 0,
        rows: {
          orgs: counts[0]?.orgs ?? 0,
          projects: counts[0]?.projects ?? 0,
          documents: counts[0]?.documents ?? 0,
          tasks: counts[0]?.tasks ?? 0,
          agentRuns: counts[0]?.agent_runs ?? 0,
        },
        latestEventAt: latest[0]?.created_at ?? null,
      };
    } finally {
      await db.close();
    }
  } catch (err) {
    return {
      engine: "absent",
      dbPath,
      schemaApplied: 0,
      rows: { orgs: 0, projects: 0, documents: 0, tasks: 0, agentRuns: 0 },
      latestEventAt: null,
      error: (err as Error).message,
    };
  }
}

export async function buildMemoryEngineDoctorReport(
  productKernel: ProductKernelDoctorReport,
): Promise<{ memoryEngine: MemoryDoctorReport; warnings: number; errors: number }> {
  let db: SqlExecutor | null = null;
  if (productKernel.engine === "pglite" && !productKernel.error) {
    try {
      db = await openLocalSqlStore(productKernel.dbPath);
    } catch { /* use null db */ }
  } else {
    try {
      db = await openLocalSqlStore(join(await mkdtemp(join(tmpdir(), "fulcrum-doctor-memory-")), "db"));
      await applyProductMigrations(db);
    } catch { /* use null db */ }
  }
  const { runMemoryDoctorChecks } = await import("../../product-" + "kernel/memory-doctor.ts");
  const memoryEngine = await runMemoryDoctorChecks(db);
  if (db) {
    try { await db.close(); } catch { /* ignore */ }
  }
  let warnings = 0;
  let errors = 0;
  for (const check of memoryEngine.checks) {
    if (check.status === "error") errors += 1;
    else if (check.status === "warning") warnings += 1;
  }
  return { memoryEngine, warnings, errors };
}

export async function buildReposDoctorReport(
  productKernel: ProductKernelDoctorReport,
): Promise<ReposDoctorReport> {
  const empty = {
    totalRepos: 0,
    syncErrors: 0,
    activeWatchers: 0,
    lruQueueDepth: 0,
    mirrorDiskGb: 0,
  };

  if (productKernel.engine !== "pglite" || productKernel.error) {
    return empty;
  }

  try {
    const db = await openLocalSqlStore(productKernel.dbPath);
    try {
      const { getReposDoctorStats } = await import("../../product-" + "kernel/store/repos.ts");
      const stats = await getReposDoctorStats(db);
      return {
        totalRepos: stats.totalRepos,
        syncErrors: stats.syncErrors,
        activeWatchers: 0,
        lruQueueDepth: 0,
        mirrorDiskGb: stats.mirrorDiskBytes / 1_073_741_824,
      };
    } finally {
      await db.close();
    }
  } catch {
    return empty;
  }
}
