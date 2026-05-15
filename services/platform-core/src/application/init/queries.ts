import type { EntityManager } from "typeorm";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { initDataSource, __resetDataSourceForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { MigratorService } from "@platform-core/infrastructure/application-database/migrator-service.ts";
import type { SchemaMigrationRepository } from "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts";
import type { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";

export type InitStatus = "bootstrapped" | "already-initialized";

export async function hasAnyOrg(em: EntityManager): Promise<boolean> {
  return await em.count(Org) > 0;
}

export async function initializeLocalDatabase(): Promise<InitStatus> {
  const dataSource = await initDataSource();
  try {
    const manager = dataSource.manager;
    const schemaRepo = dataSource.getRepository(SchemaMigration) as unknown as SchemaMigrationRepository;
    const eventRepo = dataSource.getRepository(Event) as unknown as EventRepository;
    const migratorService = new MigratorService(
      dataSource as never,
      schemaRepo,
      eventRepo,
    );
    const seedService = new SeedService(manager as never);

    await migratorService.migrate();

    const hadOrg = await hasAnyOrg(manager);
    await seedService.run();
    return hadOrg ? "already-initialized" : "bootstrapped";
  } finally {
    await dataSource.destroy();
    __resetDataSourceForTest();
  }
}
