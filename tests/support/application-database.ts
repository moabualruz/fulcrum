import { DataSource, type DataSourceOptions, type EntityManager } from "typeorm";
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
    (em as any).persist = (entity: unknown) => {
      (em as any).__pendingPersist = (em as any).__pendingPersist || [];
      (em as any).__pendingPersist.push(entity);
      return em;
    };
  }
  if (!em.flush) {
    (em as any).flush = async () => {
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
        await ds.query(`DELETE FROM "${meta.tableName}"`);
      } else {
        await ds.getRepository(entity).delete(criteria as any);
      }
    };
  }

  // MikroORM em.findOneOrFail(Entity, criteria, opts) → TypeORM em.findOneOrFail(Entity, { where })
  const origFindOneOrFail = em.findOneOrFail?.bind(em);
  if (origFindOneOrFail) {
    (em as any).findOneOrFail = async (entity: Function, criteria: any, opts?: any) => {
      // MikroORM: findOneOrFail(Entity, { id: "x" }) vs TypeORM: findOneOrFail(Entity, { where: { id: "x" } })
      const where = criteria && typeof criteria === "object" && !("where" in criteria)
        ? { where: criteria }
        : criteria;
      return origFindOneOrFail(entity as any, where);
    };
  }

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
