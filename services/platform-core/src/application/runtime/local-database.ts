import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { EntityManager } from "typeorm";
import { resolveDatabaseConfig, type ResolvedDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { initDataSource, __resetDataSourceForTest as __resetDefaultOrmForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { sqlAccess } from "@platform-core/application/legacy/orm-web-adapter.ts";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG } from "@platform-core/application/tenancy/defaults.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import type { DataSource } from "typeorm";

export type OrmDbValue = string | number | boolean | null | Date | Uint8Array;
export type ApplicationPersistence = EntityManager;
export type ApplicationOrm = DataSource;

export interface WebDatabaseHandle {
  query<T = Record<string, unknown>>(sql: string, params?: readonly OrmDbValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "typeorm";
  em: ApplicationPersistence;
  orm: ApplicationOrm;
  pglite?: unknown;
}

let _instance: WebDatabaseHandle | null = null;
let _initPromise: Promise<WebDatabaseHandle> | null = null;
let _instanceKey: string | null = null;

/**
 * Initialise the web database singleton. Must be called once at startup (e.g. in
 * hooks.server.ts). Runs ORM migrations + seeds default org. Subsequent calls
 * are no-ops that return the existing instance.
 */
export async function initDatabase(): Promise<WebDatabaseHandle> {
  const config = resolveDatabaseConfig();
  const key = runtimeDbKey(config);
  if (_instanceKey && _instanceKey !== key) {
    await resetSingleton();
    __resetDefaultOrmForTest();
  }
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const dataSource = await initDataSource();
    await dataSource.runMigrations({ transaction: "each" });

    const db = createOrmDb(dataSource, dataSource.manager, async () => {
      await dataSource.destroy();
    });
    await new SeedService(dataSource.manager).run();
    _instance = db;
    _instanceKey = key;
    return db;
  })();

  try {
    return await _initPromise;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
}

/**
 * Return the singleton ORM-backed handle. Throws if initDatabase() has not
 * been called yet (startup misconfiguration).
 */
export function getDatabase(): WebDatabaseHandle {
  if (!_instance) {
    throw new Error(
      "Web database not initialised — call initDatabase() at startup before handling requests.",
    );
  }
  return _instance;
}

export async function getE2eFixtureContext(): Promise<{ db: WebDatabaseHandle; orgId: string }> {
  const db = getDatabase();
  return { db, orgId: await getDefaultOrgId(db) };
}

/**
 * @deprecated Use getDatabase() instead. Kept for backward compat during
 * migration — delegates to initDatabase() so existing callers still work,
 * but the singleton is shared (no per-request open+migrate).
 *
 * Returns a handle whose close() is a no-op — the singleton stays open.
 * This prevents legacy callers with `finally { await db.close() }` from
 * accidentally shutting down the shared connection.
 */
export async function openDatabase(): Promise<WebDatabaseHandle> {
  const real = await initDatabase();
  // Return a thin proxy that no-ops close() to protect the singleton.
  return {
    query: real.query.bind(real),
    exec: real.exec.bind(real),
    close: async () => {
      if (isTempFulcrumHome()) {
        await resetSingleton();
        __resetDefaultOrmForTest();
      }
    },
    engine: real.engine,
    em: real.em,
    orm: real.orm,
  };
}

/**
 * Shut down the singleton (for graceful process exit or tests only).
 */
export async function closeDatabase(): Promise<void> {
  await resetSingleton();
}

/**
 * Reset singleton state for tests.
 */
export function __resetDatabaseForTest(): void {
  _instance = null;
  _initPromise = null;
  _instanceKey = null;
}

export {
  closeDatabase as closeProductDb,
  getDatabase as getProductDb,
  initDatabase as initProductDb,
  openDatabase as openProductDb,
  __resetDatabaseForTest as __resetProductDbForTest,
};

function runtimeDbKey(config: ResolvedDatabaseConfig = resolveDatabaseConfig()): string {
  if (config.backend === "postgres") return `postgres:${config.url}`;
  return `pglite:${config.dataDir}`;
}

function isTempFulcrumHome(): boolean {
  const home = process.env["FULCRUM_HOME"];
  return typeof home === "string" && home.startsWith(tmpdir());
}

async function resetSingleton(): Promise<void> {
  if (_instance) await _instance.close();
  _instance = null;
  _initPromise = null;
  _instanceKey = null;
}

function createOrmDb(
  orm: ApplicationOrm,
  em: ApplicationPersistence,
  closeRuntime: () => Promise<void>,
): WebDatabaseHandle {
  const conn = sqlAccess(em);
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly OrmDbValue[] = [],
    ): Promise<T[]> {
      return await conn.execute<T[]>(sql, params);
    },
    async exec(sql: string): Promise<void> {
      await conn.execute(sql);
    },
    async close(): Promise<void> {
      await closeRuntime();
    },
    engine: "typeorm",
    em,
    orm,
  };
}

async function ensureDefaultOrg(db: WebDatabaseHandle): Promise<void> {
  const rows = await db.query<{ id: string }>("SELECT id FROM orgs WHERE id = $1", [DEFAULT_ORG_ID]);
  if (rows.length === 0) {
    await db.query(
      "INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)",
      [DEFAULT_ORG_ID, DEFAULT_ORG_SLUG, DEFAULT_ORG_NAME],
    );
  }
}

/**
 * Resolve the default org id (slug='default'). Throws when no org row
 * exists — callers should treat that as a hard error since every load
 * path requires an org for tenancy scoping.
 */
export async function getDefaultOrgId(db: Pick<WebDatabaseHandle, "query">): Promise<string> {
  let rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE id = $1 LIMIT 1`,
    [DEFAULT_ORG_ID],
  );
  if (rows.length === 0) {
    rows = await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1 OR slug = $2 LIMIT 1`,
      [DEFAULT_ORG_SLUG, "default"],
    );
  }
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found — run `fulcrum product init`");
  return id;
}
