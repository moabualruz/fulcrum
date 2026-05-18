import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DataSource, type DataSourceOptions } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";

import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";

export interface CreateTestDataSourceOptions {
  entities?: NonNullable<DataSourceOptions["entities"]>;
  migrations?: NonNullable<DataSourceOptions["migrations"]>;
  logging?: boolean;
  synchronize?: boolean;
}

export async function createTestDataSource(options: CreateTestDataSourceOptions = {}): Promise<DataSource> {
  const dataDir = await mkdtemp(join(tmpdir(), "fulcrum-pglite-typeorm-"));
  const dataSource = new DataSource({
    type: "postgres",
    driver: new PGliteDriver({ dataDir }).driver,
    entities: options.entities ?? [],
    migrations: options.migrations ?? [],
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    synchronize: options.synchronize ?? true,
    migrationsRun: false,
    installExtensions: false,
    logging: options.logging ?? false,
  } as DataSourceOptions);

  const destroy = dataSource.destroy.bind(dataSource);
  dataSource.destroy = async () => {
    try {
      if (dataSource.isInitialized) await destroy();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  };

  await dataSource.initialize();
  if (Array.isArray(options.migrations) && options.migrations.length > 0) {
    await dataSource.runMigrations({ transaction: "none" });
  }
  return dataSource;
}

export async function truncateTestDataSource(dataSource: DataSource): Promise<void> {
  const rows = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != $1`,
    [FULCRUM_TYPEORM_MIGRATIONS_TABLE],
  ) as Array<{ tablename: string }>;
  if (rows.length === 0) return;

  const tables = rows.map((row) => `"${row.tablename.replaceAll('"', '""')}"`).join(", ");
  await dataSource.query(`TRUNCATE ${tables} CASCADE`);
}
