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

  return {
    ds,
    em: ds.manager,
    seed,
    close: async () => {
      await ds.destroy();
    },
  };
}
