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
  /** TypeORM EntityManager (replaces MikroORM orm.em) */
  em: EntityManager;
  seed: SeedResult;
  close: () => Promise<void>;
  /** @deprecated MikroORM compat shim — use ds/em directly */
  orm: { em: EntityManager; migrator?: unknown };
  /** @deprecated MikroORM compat — use ds.query() instead */
  pglite: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
}

export interface CreateTestOrmOptions {
  debug?: boolean;
}

/**
 * Build a pg-compatible driver shim from a dedicated ephemeral PGlite instance.
 * Avoids the typeorm-pglite singleton which can be poisoned by other imports
 * that set a file-backed dataDir.
 */
function buildEphemeralPgDriver() {
  let instance: PGlite | null = null;

  async function getInstance(): Promise<PGlite> {
    if (!instance) {
      instance = await PGlite.create();
    }
    return instance;
  }

  class EphemeralPool extends EventEmitter {
    doneCallback() {}
    async connect(callback: Function) {
      try {
        await getInstance();
        callback(null, this, this.doneCallback);
      } catch (error) {
        callback(error, null, this.doneCallback);
      }
    }
    async query(sqlQuery: string, queryParameters?: any, callback?: Function) {
      const pg = await getInstance();
      let cb = callback;
      let params = queryParameters;
      if (typeof queryParameters === "function") {
        cb = queryParameters;
        params = undefined;
      }
      const hasParams =
        params !== undefined && Array.isArray(params) && params.length > 0;
      // Auto-convert ? placeholders to $1, $2, … for PGlite compatibility
      let finalSql = sqlQuery;
      if (hasParams && sqlQuery.includes("?")) {
        let idx = 0;
        finalSql = sqlQuery.replace(/\?/g, () => `$${++idx}`);
      }
      const queryPromise = hasParams
        ? pg.query(finalSql, params)
        : pg.exec(finalSql).then((results) => results[results.length - 1] || { rows: [] });
      return queryPromise
        .then((results) => {
          if (cb) cb(null, results);
          return results;
        })
        .catch((error) => {
          if (cb) cb(error, null);
          throw error;
        });
    }
    end(errorCallback: Function) {
      if (instance) {
        instance.close().then(() => { instance = null; errorCallback(null); }).catch((e: unknown) => errorCallback(e));
      } else {
        errorCallback(null);
      }
    }
  }

  return class {
    static Pool = EphemeralPool;
  };
}

export async function createTestOrm(
  opts: CreateTestOrmOptions = {},
): Promise<TestOrm> {
  const driver = buildEphemeralPgDriver();

  const ds = new DataSource({
    type: "postgres",
    driver,
    entities: getCoreEntities(),
    migrations: [
      __dirname +
        "/../../services/platform-core/src/infrastructure/application-database/migrations/*.{ts,js}",
    ],
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    synchronize: false,
    installExtensions: false,
    logging: opts.debug ?? false,
  } as DataSourceOptions);

  await ds.initialize();
  await ds.runMigrations({ transaction: "none" });

  const seed = await new SeedService(ds.manager).run();

  // MikroORM compat: patch em with getConnection/persist/flush/create/getReference/transactional/getMetadata
  const em = ds.manager as EntityManager & Record<string, unknown>;
  // MikroORM em.getConnection().execute(sql, params) → TypeORM ds.query(sql, params)
  if (!em.getConnection) {
    (em as any).getConnection = () => ({
      execute: async (sql: string, params?: unknown[]) => {
        // MikroORM uses ? placeholders; TypeORM/PGlite uses $1, $2, …
        let idx = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
        return ds.query(pgSql, params);
      },
    });
  }
  // MikroORM em.clear() (no args) → no-op in TypeORM (no identity map to clear)
  const origClear = (em as any).clear;
  (em as any).clear = (...args: unknown[]) => {
    if (args.length === 0) return; // MikroORM no-arg clear → no-op
    return origClear?.apply(em, args);
  };
  if (!em.persist) {
    // MikroORM em.persist() queues entity then em.flush() saves.
    // Many tests call persist() without flush() expecting auto-save.
    // Shim: persist immediately saves and also queues for flush() compat.
    (em as any).persist = (entity: unknown) => {
      (em as any).__pendingPersist = (em as any).__pendingPersist || [];
      (em as any).__pendingPersist.push(entity);
      // Kick off immediate save (fire-and-forget) so FK is available for next await
      const saveEntity = async (e: unknown) => {
        if (Array.isArray(e)) {
          for (const item of e) await ds.manager.save(item);
        } else {
          await ds.manager.save(e);
        }
      };
      (em as any).__persistPromise = ((em as any).__persistPromise ?? Promise.resolve())
        .then(() => saveEntity(entity))
        .catch(() => {}); // suppress — flush() will report errors
      return em;
    };
  }
  if (!em.flush) {
    (em as any).flush = async () => {
      // Wait for any in-flight persist saves
      if ((em as any).__persistPromise) {
        await (em as any).__persistPromise;
      }
      const pending = (em as any).__pendingPersist || [];
      for (const entity of pending) {
        if (Array.isArray(entity)) {
          for (const e of entity) await ds.manager.save(e);
        } else {
          await ds.manager.save(entity);
        }
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
  if (!em.transactional) {
    (em as any).transactional = async (cb: (txEm: EntityManager) => Promise<unknown>) => {
      return ds.transaction(async (txEm: EntityManager) => {
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
  // MikroORM em.nativeDelete(Entity, criteria) → TypeORM em.delete(Entity, criteria)
  if (!em.nativeDelete) {
    (em as any).nativeDelete = async (entity: Function, criteria: unknown) => {
      if (criteria && typeof criteria === "object" && Object.keys(criteria as object).length === 0) {
        const meta = ds.getMetadata(entity);
        // Use TRUNCATE CASCADE to handle FK constraints between tables
        await ds.query(`TRUNCATE TABLE "${meta.tableName}" CASCADE`);
      } else {
        await ds.getRepository(entity).delete(criteria as any);
      }
    };
  }

  /**
   * Normalize MikroORM-style WHERE conditions for TypeORM.
   * MikroORM allowed bare string/number values for FK relation fields:
   *   { org: "uuid-string" } → TypeORM needs { org: { id: "uuid-string" } }
   * Also wraps bare where objects (no "where" key) into { where: ... }.
   * Also adds relations: ["org"] so row.org.id is always accessible.
   */
  function normalizeFindOptions(entityClass: Function, options: any): any {
    if (!options || typeof options !== "object") return options;

    // If options has no "where" key and looks like criteria, wrap it
    let normalized = options;
    if (!("where" in options) && !("take" in options) && !("skip" in options) &&
        !("order" in options) && !("relations" in options) && !("select" in options)) {
      normalized = { where: options };
    }

    // Get entity metadata to identify relation fields
    let meta: any;
    try { meta = ds.getMetadata(entityClass); } catch { return normalized; }
    const relationNames = new Set<string>(
      (meta.relations ?? []).map((r: any) => r.propertyName as string)
    );

    // Transform WHERE clause for TypeORM compat:
    // - Bare string FK values → { id: value } (MikroORM compat)
    // - null values → IsNull() (PGlite compat: literal null doesn't generate IS NULL correctly)
    function transformWhere(where: any): any {
      if (!where || typeof where !== "object" || Array.isArray(where)) return where;
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(where)) {
        if (relationNames.has(key) && (typeof value === "string" || typeof value === "number")) {
          // Bare primitive for a relation field → wrap as { id: value }
          result[key] = { id: value };
        } else if (value === null) {
          // null in WHERE → IsNull() for PGlite compat
          result[key] = IsNull();
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    const out = { ...normalized };
    if (out.where) {
      if (Array.isArray(out.where)) {
        out.where = out.where.map(transformWhere);
      } else {
        out.where = transformWhere(out.where);
      }
    }

    // Auto-include direct ManyToOne/ManyToMany relations (not eager) so FK ids are accessible
    // This ensures row.org.id, row.repo.id, etc. work without explicit relations in every query
    if (!out.relations && relationNames.size > 0) {
      const directRelations = (meta.relations ?? [])
        .filter((r: any) => r.relationType === "many-to-one" || r.relationType === "one-to-one")
        .map((r: any) => r.propertyName as string);
      if (directRelations.length > 0) {
        out.relations = directRelations;
      }
    }

    return out;
  }

  /** Apply MikroORM compat find-shims to any EntityManager (main or txEm). */
  function patchEntityManager(target: EntityManager & Record<string, unknown>): void {
    const origFind = target.find.bind(target);
    (target as any).find = async (entityClass: Function, options?: any) =>
      origFind(entityClass as any, normalizeFindOptions(entityClass, options));

    const origFindOne = target.findOne.bind(target);
    (target as any).findOne = async (entityClass: Function, options?: any) =>
      origFindOne(entityClass as any, normalizeFindOptions(entityClass, options));

    const origFindAndCount = target.findAndCount.bind(target);
    (target as any).findAndCount = async (entityClass: Function, options?: any) =>
      origFindAndCount(entityClass as any, normalizeFindOptions(entityClass, options));

    const origCount = target.count.bind(target);
    (target as any).count = async (entityClass: Function, options?: any) =>
      origCount(entityClass as any, normalizeFindOptions(entityClass, options));

    const origFindOneOrFail = target.findOneOrFail?.bind(target);
    if (origFindOneOrFail) {
      (target as any).findOneOrFail = async (entityClass: Function, criteria: any) =>
        origFindOneOrFail(entityClass as any, normalizeFindOptions(entityClass, criteria));
    }

    // Patch transaction() to apply shims to txEm too
    const origTransaction = target.transaction.bind(target);
    (target as any).transaction = async (cb: (txEm: EntityManager) => Promise<unknown>) => {
      return origTransaction(async (txEm: EntityManager) => {
        patchEntityManager(txEm as EntityManager & Record<string, unknown>);
        return cb(txEm);
      });
    };
  }

  patchEntityManager(em);

  // MikroORM em.create(Entity, data) → TypeORM repo.create(data) — returns unsaved instance
  const origCreate = em.create.bind(em);
  (em as any).create = function mikroCreate(...args: unknown[]) {
    // MikroORM: em.create(EntityClass, plainData) — 2 args with class first
    // TypeORM: em.create(EntityClass, plainData) — same signature!
    // But MikroORM returns a managed entity, TypeORM doesn't. Both accept same args.
    return origCreate(...(args as [any, any]));
  };

  return {
    ds,
    em: em as EntityManager,
    seed,
    close: async () => {
      await ds.destroy();
    },
    // MikroORM compat shims
    orm: { em: em as EntityManager },
    pglite: {
      query: async (sql: string, params?: unknown[]) => {
        const rows = await ds.query(sql, params);
        return { rows };
      },
    },
  };
}
