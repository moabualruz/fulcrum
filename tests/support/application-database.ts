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
      const queryPromise = hasParams
        ? pg.query(sqlQuery, params)
        : pg.exec(sqlQuery).then((results) => results[results.length - 1] || { rows: [] });
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
  if (!em.getConnection) {
    (em as any).getConnection = () => ({
      execute: <T = unknown>(sql: string, params?: unknown[]): Promise<T> =>
        ds.query(sql, params) as Promise<T>,
    });
  }
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
        // Patch the txEm too
        if (!(txEm as any).getConnection) {
          (txEm as any).getConnection = () => ({
            execute: <T = unknown>(sql: string, params?: unknown[]): Promise<T> =>
              txEm.query(sql, params) as Promise<T>,
          });
        }
        return cb(txEm);
      });
    };
  }
  if (!em.getMetadata) {
    (em as any).getMetadata = () => ds.entityMetadatas;
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
      query: (sql: string, params?: unknown[]) => ds.query(sql, params),
    },
  };
}
