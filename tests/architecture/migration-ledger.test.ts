import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { DataSource, type DataSourceOptions } from "typeorm";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { applicationMigrations, createDataSourceOptions } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import { MigratorService } from "@platform-core/infrastructure/application-database/migrator-service.ts";
import { SchemaMigrationRepository } from "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts";
import { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

function buildMigratorService(dataSource: DataSource): MigratorService {
  const schemaMigrationRepo = Object.create(SchemaMigrationRepository.prototype) as SchemaMigrationRepository;
  Object.defineProperty(schemaMigrationRepo, "schemaMigrations", { value: dataSource.getRepository(SchemaMigration) });

  const eventRepo = Object.create(EventRepository.prototype) as EventRepository;
  Object.defineProperty(eventRepo, "events", { value: dataSource.getRepository(Event) });

  return new MigratorService(dataSource, schemaMigrationRepo, eventRepo);
}

async function runApplicationMigrations(url: string): Promise<{ ledger: SchemaMigration[]; typeormRows: number }> {
  const dataSource = new DataSource({
    ...createDataSourceOptions([], { DATABASE_URL: url }),
    url,
    installExtensions: false,
  } as DataSourceOptions);

  await dataSource.initialize();
  try {
    await buildMigratorService(dataSource).migrate();
    const typeormRows = await dataSource.query(
      `SELECT name FROM "${FULCRUM_TYPEORM_MIGRATIONS_TABLE}" ORDER BY timestamp ASC`,
    ) as Array<{ name: string }>;
    const ledger = await dataSource.getRepository(SchemaMigration).find({ order: { version: "ASC" } });
    return { ledger, typeormRows: typeormRows.length };
  } finally {
    await dataSource.destroy();
  }
}

describe("migration ledger parity", () => {
  test("PGlite and PostgreSQL run the same application migration set", async () => {
    const pgliteUrl = await startPgliteSocket();
    const pgliteResult = await runApplicationMigrations(pgliteUrl);

    postgres = await startTemporaryPostgres();
    const postgresResult = await runApplicationMigrations(postgres.url);

    expect(pgliteResult.typeormRows).toBe(applicationMigrations.length);
    expect(postgresResult.typeormRows).toBe(applicationMigrations.length);
    expect(pgliteResult.ledger.length).toBe(applicationMigrations.length);
    expect(postgresResult.ledger.length).toBe(applicationMigrations.length);
  }, 30_000);

  test("schema migration ledger table exists with audit columns", async () => {
    const pgliteUrl = await startPgliteSocket();
    await runApplicationMigrations(pgliteUrl);

    const columns = await pglite!.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'fulcrum_schema_migrations'
      ORDER BY column_name
    `);

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "applied_at",
      "checksum",
      "direction",
      "name",
      "version",
    ]);
  }, 20_000);
});
