import type { EntityManager, MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { SeedService, type SeedResult } from "@platform-core/infrastructure/application-database/seed.ts";

export interface TestOrm {
  orm: MikroORM;
  em: EntityManager;
  pglite: PGlite;
  seed: SeedResult;
  close: () => Promise<void>;
}

export interface CreateTestOrmOptions {
  debug?: boolean;
}

export async function createTestOrm(
  opts: CreateTestOrmOptions = {},
): Promise<TestOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite, debug: opts.debug ?? false });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    snapshot: false,
  };

  const orm = await MikroORMRuntime.init(config);
  await orm.migrator.up();

  const seed = await new SeedService(orm.em).run();

  return {
    orm,
    em: orm.em,
    pglite,
    seed,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}
