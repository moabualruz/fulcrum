import { mkdir } from "node:fs/promises";

import type { PGlite } from "@electric-sql/pglite";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";

import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { MigratorService } from "@platform-core/infrastructure/application-database/migrator-service.ts";
import type { SchemaMigrationRepository } from "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts";
import type { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";

export type InitStatus = "bootstrapped" | "already-initialized";

export async function hasAnyOrg(em: EntityManager): Promise<boolean> {
  return await em.count(Org, {}) > 0;
}

async function openConfiguredOrm(): Promise<{ orm: MikroORM; pglite?: PGlite }> {
  const database = resolveDatabaseConfig();
  if (database.backend === "postgres") {
    const orm = await MikroORM.init(createOrmConfig({ debug: false }));
    return { orm };
  }

  await mkdir(database.dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = new PGlite(database.dataDir);
  await pglite.waitReady;
  const orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  return { orm, pglite };
}

export async function initializeLocalDatabase(): Promise<InitStatus> {
  const { orm, pglite } = await openConfiguredOrm();
  try {
    const em = orm.em.fork();
    const schemaRepo = em.getRepository(SchemaMigration) as unknown as SchemaMigrationRepository;
    const eventRepo = em.getRepository(Event) as unknown as EventRepository;
    const migratorService = new MigratorService(orm, schemaRepo, eventRepo);
    const seedService = new SeedService(em as never);

    await migratorService.migrate();

    const hadOrg = await hasAnyOrg(orm.em.fork());
    await seedService.run();
    return hadOrg ? "already-initialized" : "bootstrapped";
  } finally {
    await orm.close(true);
    await pglite?.close();
  }
}
