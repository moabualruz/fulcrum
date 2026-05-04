import { join } from "node:path";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { productDbDir } from "../../../../product-kernel/paths.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";

// ─── Singleton PGlite instance ───────────────────────────────────────────────
// Initialised once at startup via initProductDb(). All request handlers use
// getProductDb() which returns the already-open connection — no per-request
// open/migrate/close overhead.

let _instance: ProductDb | null = null;
let _initPromise: Promise<ProductDb> | null = null;

/**
 * Initialise the PGlite singleton. Must be called once at startup (e.g. in
 * hooks.server.ts). Runs migrations + seeds default org. Subsequent calls
 * are no-ops that return the existing instance.
 */
export async function initProductDb(): Promise<ProductDb> {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const db = await openPglite(join(productDbDir(), "main"));
    await runMigrations(db);
    await ensureDefaultOrg(db);
    _instance = db;
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
 * Return the singleton PGlite instance. Throws if initProductDb() has not
 * been called yet (startup misconfiguration).
 */
export function getProductDb(): ProductDb {
  if (!_instance) {
    throw new Error(
      "ProductDb not initialised — call initProductDb() at startup before handling requests.",
    );
  }
  return _instance;
}

/**
 * @deprecated Use getProductDb() instead. Kept for backward compat during
 * migration — delegates to initProductDb() so existing callers still work,
 * but the singleton is shared (no per-request open+migrate).
 *
 * Returns a handle whose close() is a no-op — the singleton stays open.
 * This prevents legacy callers with `finally { await db.close() }` from
 * accidentally shutting down the shared connection.
 */
export async function openProductDb(): Promise<ProductDb> {
  const real = await initProductDb();
  // Return a thin proxy that no-ops close() to protect the singleton.
  return {
    query: real.query.bind(real),
    exec: real.exec.bind(real),
    close: async () => { /* no-op — singleton managed by closeProductDb() */ },
    engine: real.engine,
  };
}

/**
 * Shut down the singleton (for graceful process exit or tests only).
 */
export async function closeProductDb(): Promise<void> {
  if (_instance) {
    await _instance.close();
    _instance = null;
    _initPromise = null;
  }
}

/**
 * Reset singleton state for tests.
 */
export function __resetProductDbForTest(): void {
  _instance = null;
  _initPromise = null;
}

async function ensureDefaultOrg(db: ProductDb): Promise<void> {
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
export async function getDefaultOrgId(db: ProductDb): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found — run `fulcrum product init`");
  return id;
}
