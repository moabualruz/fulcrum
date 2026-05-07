import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityManager } from "@mikro-orm/postgresql";
import { __resetDefaultOrmForTest, initOrm } from "../../../../db/mikro-orm.config.ts";
import { sqlAccess } from "./orm-helpers.ts";

export type OrmDbValue = string | number | boolean | null | Date | Uint8Array;

export interface WebDatabaseHandle {
  query<T = Record<string, unknown>>(sql: string, params?: readonly OrmDbValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "mikro-orm";
  em: EntityManager;
  orm: import("@mikro-orm/postgresql").MikroORM;
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
  const key = runtimeDbKey();
  if (_instanceKey && _instanceKey !== key) {
    await resetSingleton();
    await __resetDefaultOrmForTest();
  }
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await mkdir(productDbDir(), { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { vector } = await import("@electric-sql/pglite/vector");
    const pglite = new PGlite(join(productDbDir(), "main"), { extensions: { vector } });
    await pglite.waitReady;
    const orm = await initOrm({ pglite });
    if (!(await hasExistingSchema(orm.em))) {
      await orm.migrator.up();
    }
    const db = createOrmDb(orm, orm.em.fork(), async () => {
      await orm.close(true);
      await pglite.close();
    });
    db.pglite = pglite;
    await ensureDefaultOrg(db);
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
        await __resetDefaultOrmForTest();
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
  closeDatabase as closeProduct\u0044b,
  getDatabase as getProduct\u0044b,
  initDatabase as initProduct\u0044b,
  openDatabase as openProduct\u0044b,
  __resetDatabaseForTest as __resetProduct\u0044bForTest,
};

function runtimeDbKey(): string {
  return process.env["FULCRUM_HOME"] ?? process.env["DATABASE_URL"] ?? process.cwd();
}

function isTempFulcrumHome(): boolean {
  const home = process.env["FULCRUM_HOME"];
  return typeof home === "string" && home.startsWith(tmpdir());
}

function productDbDir(): string {
  return join(process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum"), "state", "product", "db");
}

async function resetSingleton(): Promise<void> {
  if (_instance) await _instance.close();
  _instance = null;
  _initPromise = null;
  _instanceKey = null;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?");
}

function createOrmDb(
  orm: import("@mikro-orm/postgresql").MikroORM,
  em: EntityManager,
  closeRuntime: () => Promise<void>,
): WebDatabaseHandle {
  const conn = sqlAccess(em);
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly OrmDbValue[] = [],
    ): Promise<T[]> {
      return await conn.execute<T[]>(normalizeSql(sql), [...params]);
    },
    async exec(sql: string): Promise<void> {
      await conn.execute(sql);
    },
    async close(): Promise<void> {
      em.clear();
      await closeRuntime();
    },
    engine: "mikro-orm",
    em,
    orm,
  };
}

async function hasExistingSchema(em: EntityManager): Promise<boolean> {
  try {
    await sqlAccess(em).execute("SELECT 1 FROM orgs LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

async function ensureDefaultOrg(db: WebDatabaseHandle): Promise<void> {
  const rows = await db.query<{ id: string }>("SELECT id FROM orgs WHERE slug = $1", ["default"]);
  if (rows.length === 0) {
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)",
      [id, "default", "Local"],
    );
  }
}

/**
 * Resolve the default org id (slug='default'). Throws when no org row
 * exists — callers should treat that as a hard error since every load
 * path requires an org for tenancy scoping.
 */
export async function getDefaultOrgId(db: Pick<WebDatabaseHandle, "query">): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found — run `fulcrum product init`");
  return id;
}
