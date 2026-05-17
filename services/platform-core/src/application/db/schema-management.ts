/** Minimal DI container interface for CLI/tRPC callers. */
interface Container {
  get<T>(token: new (...args: unknown[]) => T): T;
}

import {
  dbHistory,
  dbMigrate,
  dbStatus,
} from "@platform-core/infrastructure/application-database/db.router.ts";

export async function runSchemaMigration(
  container: Container | null,
  options: { targetVersion?: string; force?: boolean },
) {
  return dbMigrate(container, options);
}

export async function readSchemaStatus(container: Container | null) {
  return dbStatus(container);
}

export async function readSchemaHistory(container: Container | null) {
  return dbHistory(container);
}

export async function runStandalonePgliteSchemaMigration(options: {
  targetVersion?: string;
  force?: boolean;
}): Promise<{ backend: "pglite"; ok: true; applied: string[] }> {
  const { PGliteDriver } = await import("typeorm-pglite");
  const { DataSource } = await import("typeorm");
  const { createDataSourceOptions } = await import(
    "@platform-core/infrastructure/application-database/typeorm.config.ts"
  );
  const { MigratorService } = await import(
    "@platform-core/infrastructure/application-database/migrator-service.ts"
  );
  const { EventRepository } = await import(
    "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts"
  );
  const { SchemaMigration } = await import(
    "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts"
  );
  const { SchemaMigrationRepository } = await import(
    "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts"
  );

  const opts = createDataSourceOptions([], {});
  const driver = new PGliteDriver().driver;
  const ds = new DataSource({
    ...opts,
    driver,
    logging: false,
    installExtensions: false,
  } as ConstructorParameters<typeof DataSource>[0]);
  await ds.initialize();

  try {
    const schemaMigrationRepo = Object.create(
      SchemaMigrationRepository.prototype,
    ) as InstanceType<typeof SchemaMigrationRepository>;
    Object.defineProperty(schemaMigrationRepo, "schemaMigrations", {
      value: ds.getRepository(SchemaMigration),
    });

    const { Event } = await import(
      "@platform-core/infrastructure/application-database/entities/core/Event.ts"
    );
    const eventRepo = Object.create(EventRepository.prototype) as InstanceType<typeof EventRepository>;
    Object.defineProperty(eventRepo, "events", { value: ds.getRepository(Event) });

    const service = new MigratorService(ds, schemaMigrationRepo, eventRepo);
    const before = await service.status();
    await service.migrate(options.targetVersion, options.force ?? false);
    const after = await service.status();

    const appliedCount = (before.pending ?? []).length - (after.pending ?? []).length;
    const applied = (before.pending ?? []).slice(0, appliedCount > 0 ? appliedCount : 0);

    return { backend: "pglite", ok: true, applied };
  } finally {
    await ds.destroy();
  }
}
