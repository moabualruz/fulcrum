import { DataSource, IsNull, type DataSourceOptions, type EntityManager } from "typeorm";
import { PGlite } from "@electric-sql/pglite";
import { EventEmitter } from "events";

import {
  getCoreEntities,
} from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { SeedService, type SeedResult } from "@platform-core/infrastructure/application-database/seed.ts";

export interface TestOrm {
  ds: DataSource;
  em: EntityManager;
  seed: SeedResult;
  close: () => Promise<void>;
  orm: { em: EntityManager; migrator?: unknown };
  pglite: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
}

export interface CreateTestOrmOptions {
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// Singleton PGlite DataSource — init once, TRUNCATE CASCADE between tests.
// 73 test files × 7 migrations × 60+ tables = 500s → ~30s.
// ---------------------------------------------------------------------------

let _cachedDs: DataSource | null = null;
let _cachedSeed: SeedResult | null = null;
let _initPromise: Promise<void> | null = null;

function buildEphemeralPgDriver() {
  let instance: PGlite | null = null;
  async function getInstance(): Promise<PGlite> {
    if (!instance) instance = await PGlite.create();
    return instance;
  }
  class EphemeralPool extends EventEmitter {
    doneCallback() {}
    async connect(callback: Function) {
      try { await getInstance(); callback(null, this, this.doneCallback); }
      catch (error) { callback(error, null, this.doneCallback); }
    }
    async query(sqlQuery: string, queryParameters?: any, callback?: Function) {
      const pg = await getInstance();
      let cb = callback, params = queryParameters;
      if (typeof queryParameters === "function") { cb = queryParameters; params = undefined; }
      const hasParams = params !== undefined && Array.isArray(params) && params.length > 0;
      let finalSql = sqlQuery;
      if (hasParams && sqlQuery.includes("?")) {
        let idx = 0;
        finalSql = sqlQuery.replace(/\?/g, () => `$${++idx}`);
      }
      const queryPromise = hasParams
        ? pg.query(finalSql, params)
        : pg.exec(finalSql).then((r) => r[r.length - 1] || { rows: [] });
      return queryPromise
        .then((results) => { if (cb) cb(null, results); return results; })
        .catch((error) => { if (cb) cb(error, null); throw error; });
    }
    end(errorCallback: Function) {
      if (instance) {
        instance.close().then(() => { instance = null; errorCallback(null); }).catch((e: unknown) => errorCallback(e));
      } else { errorCallback(null); }
    }
  }
  return class { static Pool = EphemeralPool; };
}

async function ensureInitialized(debug: boolean): Promise<{ ds: DataSource; seed: SeedResult }> {
  if (_cachedDs?.isInitialized && _cachedSeed) return { ds: _cachedDs, seed: _cachedSeed };
  if (!_initPromise) {
    _initPromise = (async () => {
      const driver = buildEphemeralPgDriver();
      const ds = new DataSource({
        type: "postgres",
        driver,
        entities: getCoreEntities(),
        migrations: [
          __dirname + "/../../services/platform-core/src/infrastructure/application-database/migrations/*.{ts,js}",
        ],
        migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
        synchronize: false,
        installExtensions: false,
        logging: debug,
      } as DataSourceOptions);
      await ds.initialize();
      await ds.runMigrations({ transaction: "none" });
      const seed = await new SeedService(ds.manager).run();
      _cachedDs = ds;
      _cachedSeed = seed;
    })();
  }
  await _initPromise;
  return { ds: _cachedDs!, seed: _cachedSeed! };
}

async function truncateAllTables(ds: DataSource): Promise<void> {
  // Only truncate tables that actually exist in the database
  const result = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != $1`,
    [FULCRUM_TYPEORM_MIGRATIONS_TABLE],
  );
  const existing = (result as Array<{ tablename: string }>).map((r) => `"${r.tablename}"`);
  if (existing.length === 0) return;
  await ds.query(`TRUNCATE ${existing.join(", ")} CASCADE`);
}

export async function createTestOrm(opts: CreateTestOrmOptions = {}): Promise<TestOrm> {
  const { ds } = await ensureInitialized(opts.debug ?? false);
  await truncateAllTables(ds);
  const seed = await new SeedService(ds.manager).run();
  const em = ds.manager as EntityManager & Record<string, unknown>;
  // Reset pending state from previous test run (singleton em is shared)
  (em as any).__pendingPersist = [];
  (em as any).__persistPromise = undefined;

  // MikroORM compat shims (applied once, idempotent)
  if (!em.getConnection) {
    (em as any).getConnection = () => ({
      execute: async (sql: string, params?: unknown[]) => {
        let idx = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
        return ds.query(pgSql, params);
      },
    });
  }
  if (!(em as any)._mikroClearPatched) {
    const origClear = (em as any).clear;
    (em as any).clear = (...args: unknown[]) => {
      if (args.length === 0) return;
      return origClear?.apply(em, args);
    };
    (em as any)._mikroClearPatched = true;
  }
  if (!em.persist) {
    (em as any).persist = (entity: unknown) => {
      (em as any).__pendingPersist = (em as any).__pendingPersist || [];
      (em as any).__pendingPersist.push(entity);
      const saveEntity = async (e: unknown) => {
        if (Array.isArray(e)) { for (const item of e) await ds.manager.save(item); }
        else { await ds.manager.save(e); }
      };
      (em as any).__persistPromise = ((em as any).__persistPromise ?? Promise.resolve())
        .then(() => saveEntity(entity)).catch(() => {});
      return em;
    };
  }
  if (!em.flush) {
    (em as any).flush = async () => {
      if ((em as any).__persistPromise) await (em as any).__persistPromise;
      const pending = (em as any).__pendingPersist || [];
      for (const entity of pending) {
        if (Array.isArray(entity)) { for (const e of entity) await ds.manager.save(e); }
        else { await ds.manager.save(entity); }
      }
      (em as any).__pendingPersist = [];
    };
  }
  if (!em.getReference) {
    (em as any).getReference = (entityClass: Function, id: unknown) => {
      const instance = Object.create(entityClass.prototype);
      instance.id = id;
      return instance;
    };
  }
  if (!(em as any).getUnitOfWork) {
    (em as any).getUnitOfWork = () => ({
      getChangeSets: () => ((em as any).__pendingPersist || []).map((entity: unknown) => ({ entity })),
    });
  }
  if (!em.transactional) {
    (em as any).transactional = async (cb: (txEm: EntityManager) => Promise<unknown>) => {
      return ds.transaction(async (txEm: EntityManager) => {
        patchEntityManager(txEm as EntityManager & Record<string, unknown>, ds);
        return cb(txEm);
      });
    };
  }
  if (!em.getMetadata) {
    (em as any).getMetadata = () => {
      const metas = ds.entityMetadatas;
      return Object.assign(metas, {
        get: (entity: Function | string) => {
          const name = typeof entity === "string" ? entity : entity.name;
          return metas.find((m) => m.name === name || m.target === entity);
        },
      });
    };
  }
  if (!em.nativeDelete) {
    (em as any).nativeDelete = async (entity: Function, criteria: unknown) => {
      // Clear pending persist queue before deleting — prevents stale entities being re-inserted
      (em as any).__pendingPersist = [];
      (em as any).__persistPromise = undefined;
      if (criteria && typeof criteria === "object" && Object.keys(criteria as object).length === 0) {
        const meta = ds.getMetadata(entity);
        await ds.query(`TRUNCATE TABLE "${meta.tableName}" CASCADE`);
      } else {
        await ds.getRepository(entity).delete(criteria as any);
      }
    };
  }

  if (!(em as any)._mikroFindPatched) {
    patchEntityManager(em, ds);
    (em as any)._mikroFindPatched = true;
  }

  const origEmQuery = em.query.bind(em);
  (em as any).query = async (...args: unknown[]) => {
    await drainPersist(em, ds);
    return origEmQuery(...(args as [any]));
  };

  if (!(em as any)._mikroCreatePatched) {
    const origCreate = em.create.bind(em);
    (em as any).create = function mikroCreate(...args: unknown[]) {
      const entity = origCreate(...(args as [any, any]));
      if (args.length >= 2) {
        (em as any).__pendingPersist = (em as any).__pendingPersist || [];
        (em as any).__pendingPersist.push(entity);
      }
      return entity;
    };
    (em as any)._mikroCreatePatched = true;
  }

  return {
    ds,
    em: em as EntityManager,
    seed,
    close: async () => {
      (em as any).__pendingPersist = [];
      (em as any).__persistPromise = undefined;
    },
    orm: { em: em as EntityManager },
    pglite: {
      query: async (sql: string, params?: unknown[]) => {
        const rows = await ds.query(sql, params);
        return { rows };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function drainPersist(em: EntityManager & Record<string, unknown>, ds: DataSource): Promise<void> {
  if ((em as any).__persistPromise) await (em as any).__persistPromise.catch(() => {});
  const pending: unknown[] = (em as any).__pendingPersist || [];
  if (pending.length > 0) {
    (em as any).__pendingPersist = [];
    for (const entity of pending) {
      if (Array.isArray(entity)) { for (const e of entity) await ds.manager.save(e); }
      else { await ds.manager.save(entity); }
    }
  }
}

function patchEntityManager(target: EntityManager & Record<string, unknown>, ds: DataSource): void {
  function normalizeFindOptions(entityClass: Function, options: any): any {
    if (!options || typeof options !== "object") return options;
    let normalized = options;
    if (!("where" in options) && !("take" in options) && !("skip" in options) &&
        !("order" in options) && !("relations" in options) && !("select" in options)) {
      normalized = { where: options };
    }
    let meta: any;
    try { meta = ds.getMetadata(entityClass); } catch { return normalized; }
    const relationNames = new Set<string>((meta.relations ?? []).map((r: any) => r.propertyName as string));
    function transformWhere(where: any): any {
      if (!where || typeof where !== "object" || Array.isArray(where)) return where;
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(where)) {
        if (relationNames.has(key) && (typeof value === "string" || typeof value === "number")) {
          result[key] = { id: value };
        } else if (value === null) {
          result[key] = IsNull();
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    const out = { ...normalized };
    if (out.where) {
      out.where = Array.isArray(out.where) ? out.where.map(transformWhere) : transformWhere(out.where);
    }
    if (!out.relations && relationNames.size > 0) {
      const directRelations = (meta.relations ?? [])
        .filter((r: any) => r.relationType === "many-to-one" || r.relationType === "one-to-one")
        .map((r: any) => r.propertyName as string);
      if (directRelations.length > 0) out.relations = directRelations;
    }
    return out;
  }

  function mergeThreeArgOptions(where: any, extraOpts: any): any {
    const merged: Record<string, any> = { ...extraOpts };
    if (where) merged.where = where;
    if (merged.orderBy && !merged.order) { merged.order = merged.orderBy; delete merged.orderBy; }
    return merged;
  }

  const origFind = target.find.bind(target);
  (target as any).find = async (entityClass: Function, options?: any, thirdArg?: any) => {
    await drainPersist(target, ds);
    const combined = thirdArg !== undefined ? mergeThreeArgOptions(options, thirdArg) : options;
    return origFind(entityClass as any, normalizeFindOptions(entityClass, combined));
  };
  const origFindOne = target.findOne.bind(target);
  (target as any).findOne = async (entityClass: Function, options?: any, thirdArg?: any) => {
    await drainPersist(target, ds);
    const combined = thirdArg !== undefined ? mergeThreeArgOptions(options, thirdArg) : options;
    return origFindOne(entityClass as any, normalizeFindOptions(entityClass, combined));
  };
  const origFindAndCount = target.findAndCount.bind(target);
  (target as any).findAndCount = async (entityClass: Function, options?: any) => {
    await drainPersist(target, ds);
    return origFindAndCount(entityClass as any, normalizeFindOptions(entityClass, options));
  };
  const origCount = target.count.bind(target);
  (target as any).count = async (entityClass: Function, options?: any) => {
    await drainPersist(target, ds);
    return origCount(entityClass as any, normalizeFindOptions(entityClass, options));
  };
  const origFindOneOrFail = target.findOneOrFail?.bind(target);
  if (origFindOneOrFail) {
    (target as any).findOneOrFail = async (entityClass: Function, criteria: any) => {
      await drainPersist(target, ds);
      return origFindOneOrFail(entityClass as any, normalizeFindOptions(entityClass, criteria));
    };
  }
  const origTransaction = target.transaction.bind(target);
  (target as any).transaction = async (cb: (txEm: EntityManager) => Promise<unknown>) => {
    return origTransaction(async (txEm: EntityManager) => {
      patchEntityManager(txEm as EntityManager & Record<string, unknown>, ds);
      return cb(txEm);
    });
  };
}
