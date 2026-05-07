import { mkdir } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";

import { resolveDatabaseConfig } from "../../config/database.ts";
import { registerDbBindings } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { createOrmConfig } from "../../db/mikro-orm.config.ts";
import { MigratorService } from "../../db/migrator-service.ts";
import { SeedService } from "../../db/seed.ts";
import { registerSeedBindings } from "../../db/seed.module.ts";

export type InitStatus = "bootstrapped" | "already-initialized";

export async function hasAnyOrg(em: EntityManager): Promise<boolean> {
  return await em.count(Org, {}) > 0;
}

async function openLocalOrm(): Promise<{ orm: MikroORM; pglite: PGlite }> {
  const database = resolveDatabaseConfig();
  if (database.backend !== "pglite") {
    throw new Error("fulcrum init currently requires the pglite backend. Run fulcrum db migrate for PostgreSQL.");
  }

  await mkdir(database.dataDir, { recursive: true });
  const pglite = new PGlite(database.dataDir);
  await pglite.waitReady;
  const orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  return { orm, pglite };
}

export async function initializeLocalDatabase(): Promise<InitStatus> {
  const { orm, pglite } = await openLocalOrm();
  try {
    const container = new Container();
    registerDbBindings(container, orm);
    registerSeedBindings(container);

    await container.get(MigratorService).migrate();

    const hadOrg = await hasAnyOrg(orm.em.fork());
    await container.get(SeedService).run();
    return hadOrg ? "already-initialized" : "bootstrapped";
  } finally {
    await orm.close(true);
    await pglite.close();
  }
}
