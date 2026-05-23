import { mkdir, mkdtemp, rename, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { applyProductMigrations } from "@platform-core/infrastructure/application-database/product-migrations.ts";
import { openLocalSqlStore, openPostgresSqlStore, type SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { isCompiledBunBinary } from "@platform-core/infrastructure/product-store/db/pglite.ts";

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
  recoveryAction?: "pglite-rebuild";
  recoveryCommand?: string;
}

export interface PgliteRebuildReport {
  action: "pglite-rebuild";
  dbPath: string;
  quarantinedPath: string | null;
  verified: boolean;
  schemaApplied: number;
}

export interface ReposDoctorReport {
  totalRepos: number;
  syncErrors: number;
  activeWatchers: number;
  lruQueueDepth: number;
  mirrorDiskGb: number;
}

const EMPTY_PRODUCT_ROWS = {
  orgs: 0,
  projects: 0,
  documents: 0,
  tasks: 0,
  agentRuns: 0,
} as const;

function redactDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (url.password) url.password = "***";
  return url.toString();
}

function normalizeTimestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

async function inspectProductDatabase(
  engine: "pglite" | "postgres",
  dbPath: string,
  open: () => Promise<SqlExecutor> | SqlExecutor,
): Promise<ProductKernelDoctorReport> {
  let db: SqlExecutor | null = null;
  try {
    db = await open();
    const schemaRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'schema_migrations' AND relkind = 'r'`,
    );
    if ((schemaRows[0]?.count ?? 0) === 0) {
      return {
        engine,
        dbPath,
        schemaApplied: 0,
        rows: EMPTY_PRODUCT_ROWS,
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
    const latest = await db.query<{ created_at: string | Date | null }>(
      `SELECT created_at FROM events ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    return {
      engine,
      dbPath,
      schemaApplied: applied[0]?.count ?? 0,
      rows: {
        orgs: counts[0]?.orgs ?? 0,
        projects: counts[0]?.projects ?? 0,
        documents: counts[0]?.documents ?? 0,
        tasks: counts[0]?.tasks ?? 0,
        agentRuns: counts[0]?.agent_runs ?? 0,
      },
      latestEventAt: normalizeTimestamp(latest[0]?.created_at),
    };
  } catch (err) {
    const report: ProductKernelDoctorReport = {
      engine,
      dbPath,
      schemaApplied: 0,
      rows: EMPTY_PRODUCT_ROWS,
      latestEventAt: null,
      error: (err as Error).message,
    };
    if (engine === "pglite") {
      report.recoveryAction = "pglite-rebuild";
      report.recoveryCommand = "fulcrum doctor --run-fix=pglite-rebuild";
    }
    return report;
  } finally {
    if (db) {
      try { await db.close(); } catch { /* ignore */ }
    }
  }
}

async function openSelectedProductDatabase(
  productKernel: ProductKernelDoctorReport,
): Promise<SqlExecutor | null> {
  if (productKernel.engine === "absent" || productKernel.error) return null;
  // PGlite's vector tarball is unreachable from a Bun-compiled $bunfs; skip
  // the open so memory / repos reports return their no-DB defaults instead
  // of crashing the whole doctor run.
  if (isCompiledBunBinary()) return null;
  if (productKernel.engine === "pglite") return openLocalSqlStore(productKernel.dbPath);

  const config = resolveDatabaseConfig();
  if (config.backend !== "postgres") return null;
  return openPostgresSqlStore(config.url);
}

export async function buildProductKernelDoctorReport(): Promise<ProductKernelDoctorReport> {
  const config = resolveDatabaseConfig();
  if (config.backend === "postgres") {
    return inspectProductDatabase(
      "postgres",
      redactDatabaseUrl(config.url),
      () => openPostgresSqlStore(config.url),
    );
  }
  const dbPath = config.dataDir;
  const exists = await Bun.file(`${dbPath}/PG_VERSION`).exists();
  if (!exists) {
    return {
      engine: "absent",
      dbPath,
      schemaApplied: 0,
      rows: EMPTY_PRODUCT_ROWS,
      latestEventAt: null,
    };
  }
  // PGlite's `vector.tar.gz` cannot be resolved from inside a Bun-compiled
  // `$bunfs`, so calling `openLocalSqlStore` would crash the whole doctor
  // run. In compiled binaries return the lightweight `pglite` report based on
  // the PG_VERSION marker alone — full inspection still works under `bun run`
  // and the NestJS server.
  if (isCompiledBunBinary()) {
    return {
      engine: "pglite",
      dbPath,
      schemaApplied: 0,
      rows: EMPTY_PRODUCT_ROWS,
      latestEventAt: null,
    };
  }
  return inspectProductDatabase("pglite", dbPath, () => openLocalSqlStore(dbPath));
}

export async function rebuildLocalPgliteDatabase(): Promise<PgliteRebuildReport> {
  const config = resolveDatabaseConfig();
  if (config.backend !== "pglite") {
    throw new Error("pglite-rebuild requires local PGlite; unset FULCRUM_DATABASE_URL/DATABASE_URL or switch backend");
  }
  const dbPath = config.dataDir;
  let quarantinedPath: string | null = null;
  try {
    await stat(dbPath);
    quarantinedPath = `${dbPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await mkdir(dirname(quarantinedPath), { recursive: true });
    await rename(dbPath, quarantinedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const db = await openLocalSqlStore(dbPath);
  try {
    await applyProductMigrations(db);
  } finally {
    await db.close();
  }

  const verified = await buildProductKernelDoctorReport();
  if (verified.error || verified.engine !== "pglite") {
    throw new Error(`pglite rebuild verification failed: ${verified.error ?? verified.engine}`);
  }

  return {
    action: "pglite-rebuild",
    dbPath,
    quarantinedPath,
    verified: true,
    schemaApplied: verified.schemaApplied,
  };
}

export async function buildMemoryEngineDoctorReport(
  productKernel: ProductKernelDoctorReport,
): Promise<{ memoryEngine: MemoryDoctorReport; warnings: number; errors: number }> {
  let db = await openSelectedProductDatabase(productKernel);
  // Inside a Bun-compiled $bunfs PGlite cannot open a real path either —
  // skip the tmpdir fallback so the memory report still completes with the
  // no-DB defaults.
  if (!db && !isCompiledBunBinary()) {
    try {
      db = await openLocalSqlStore(join(await mkdtemp(join(tmpdir(), "fulcrum-doctor-memory-")), "db"));
      await applyProductMigrations(db);
    } catch { /* use null db */ }
  }
  const { runMemoryDoctorChecks } = await import("@platform-core/infrastructure/product-store/memory-doctor.ts");
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

  if (productKernel.engine === "absent" || productKernel.error) return empty;

  try {
    const db = await openSelectedProductDatabase(productKernel);
    if (!db) return empty;
    try {
      const { getReposDoctorStats } = await import("@platform-core/infrastructure/product-store/store/repos.ts");
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
