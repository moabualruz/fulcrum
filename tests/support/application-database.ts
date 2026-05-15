import { DataSource, type DataSourceOptions, type EntityManager } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";

import {
  createDataSourceOptions,
} from "@platform-core/infrastructure/application-database/typeorm.config.ts";
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

export async function createTestOrm(
  opts: CreateTestOrmOptions = {},
): Promise<TestOrm> {
  // in-memory PGlite (no dataDir = ephemeral)
  const driver = new PGliteDriver().driver;

  const baseOptions = createDataSourceOptions([], {});
  const ds = new DataSource({
    ...baseOptions,
    driver,
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
