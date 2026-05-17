import "reflect-metadata";

import { DataSource, type DataSourceOptions } from "typeorm";
import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";

export const FULCRUM_TYPEORM_MIGRATIONS_TABLE = "schema_migrations";
export type FulcrumTypeOrmOptions = Extract<DataSourceOptions, { type: "postgres" }>;

export type FulcrumTypeOrmConnectionSource = "postgres" | "pglite-socket";

export interface FulcrumTypeOrmConnection {
  source: FulcrumTypeOrmConnectionSource;
  url: string;
}

export type FulcrumTypeOrmConnectionTarget =
  | FulcrumTypeOrmConnection
  | { source: "pglite"; dataDir: string };

export interface BuildFulcrumTypeOrmOptionsInput extends FulcrumTypeOrmConnection {
  entities?: NonNullable<DataSourceOptions["entities"]>;
  migrations?: NonNullable<DataSourceOptions["migrations"]>;
}

const POSTGRES_URL_PATTERN = /^postgres(?:ql)?:\/\//;

function assertPostgresUrl(name: string, value: string): void {
  if (!POSTGRES_URL_PATTERN.test(value)) {
    throw new Error(`${name} must be a postgres:// or postgresql:// connection string`);
  }
}

export function resolveFulcrumTypeOrmConnection(
  env: Record<string, string | undefined> = process.env,
): FulcrumTypeOrmConnection {
  const target = resolveFulcrumTypeOrmConnectionTarget(env);
  if (target.source === "pglite") {
    throw new Error(
      "Nest TypeORM local PGlite startup requires the managed connection runtime",
    );
  }
  return target;
}

export function resolveFulcrumTypeOrmConnectionTarget(
  env: Record<string, string | undefined> = process.env,
): FulcrumTypeOrmConnectionTarget {
  const databaseUrl = env["FULCRUM_DATABASE_URL"] ?? env["DATABASE_URL"];
  if (databaseUrl) {
    const name = env["FULCRUM_DATABASE_URL"] ? "FULCRUM_DATABASE_URL" : "DATABASE_URL";
    assertPostgresUrl(name, databaseUrl);
    return { source: "postgres", url: databaseUrl };
  }

  const pgliteSocketUrl = env["FULCRUM_TYPEORM_PGLITE_SOCKET_URL"];
  if (pgliteSocketUrl) {
    assertPostgresUrl("FULCRUM_TYPEORM_PGLITE_SOCKET_URL", pgliteSocketUrl);
    return { source: "pglite-socket", url: pgliteSocketUrl };
  }

  const database = resolveDatabaseConfig({ env });
  if (database.backend === "postgres") return { source: "postgres", url: database.url };
  return { source: "pglite", dataDir: database.dataDir };
}

export function buildFulcrumTypeOrmOptions(
  input: BuildFulcrumTypeOrmOptionsInput,
): FulcrumTypeOrmOptions {
  assertPostgresUrl(input.source === "pglite-socket"
    ? "FULCRUM_TYPEORM_PGLITE_SOCKET_URL"
    : "DATABASE_URL", input.url);

  return {
    type: "postgres",
    url: input.url,
    entities: input.entities ?? [],
    migrations: input.migrations ?? [],
    migrationsTableName: FULCRUM_TYPEORM_MIGRATIONS_TABLE,
    synchronize: false,
    migrationsRun: false,
  };
}

export function createFulcrumTypeOrmDataSource(
  options: DataSourceOptions = buildFulcrumTypeOrmOptions(resolveFulcrumTypeOrmConnection()),
): DataSource {
  return new DataSource(options);
}
