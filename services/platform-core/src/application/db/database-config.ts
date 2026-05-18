import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { openLocalSqlStore, openPostgresSqlStore, type SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";

export type DbBackend = "pglite" | "postgres";

export interface PersistedDatabaseConfig {
  db?: {
    backend?: string;
    url?: string;
    dataDir?: string;
  };
}

export interface DatabaseConfigInput {
  env?: Record<string, string | undefined>;
  config?: PersistedDatabaseConfig;
  cli?: {
    backend?: string;
    url?: string;
    dataDir?: string;
  };
}

export type ResolvedDatabaseConfig =
  | { backend: "pglite"; dataDir: string; url?: undefined }
  | { backend: "postgres"; url: string; dataDir?: undefined };

export function fulcrumHome(env: Record<string, string | undefined> = process.env): string {
  return env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

export function defaultLocalPgliteDataDir(env: Record<string, string | undefined> = process.env): string {
  return join(fulcrumHome(env), "db", "main");
}

function databaseUrlFromEnv(env: Record<string, string | undefined>): string | undefined {
  return env["FULCRUM_DATABASE_URL"] ?? env["DATABASE_URL"];
}

function isPostgresUrl(value: string): boolean {
  return value.startsWith("postgresql://") || value.startsWith("postgres://");
}

function assertPostgresUrl(name: string, value: string): void {
  if (!isPostgresUrl(value)) {
    throw new Error(`${name} must be a postgres:// or postgresql:// connection string`);
  }
}

function normalizeBackend(value: string | undefined): DbBackend | undefined {
  if (value === "pglite" || value === "postgres") return value;
  if (value === undefined || value === "") return undefined;
  throw new Error(`unsupported database backend: ${value}`);
}

function postgresUrlFrom(
  backend: DbBackend | undefined,
  cliUrl: string | undefined,
  persistedUrl: string | undefined,
  envUrl: string | undefined,
): string | undefined {
  if (cliUrl) return cliUrl;
  if (backend === "postgres" && envUrl) return envUrl;
  if (persistedUrl) return persistedUrl;
  return undefined;
}

export function resolveDatabaseConfig(input: DatabaseConfigInput = {}): ResolvedDatabaseConfig {
  const env = input.env ?? process.env;
  const persisted = input.config?.db ?? {};
  const cli = input.cli ?? {};
  const envUrl = databaseUrlFromEnv(env);
  if (envUrl) {
    const name = env["FULCRUM_DATABASE_URL"] ? "FULCRUM_DATABASE_URL" : "DATABASE_URL";
    assertPostgresUrl(name, envUrl);
  }

  const cliBackend = normalizeBackend(cli.backend);
  const persistedBackend = normalizeBackend(persisted.backend);
  const envBackend = envUrl ? "postgres" : undefined;

  const backend =
    cliBackend ??
    envBackend ??
    persistedBackend ??
    "pglite";

  if (backend === "postgres") {
    const url = postgresUrlFrom(backend, cli.url, persisted.url, envUrl);
    if (!url) {
      throw new Error("PostgreSQL backend requires --url, persisted db.url, or DATABASE_URL");
    }
    let name = "persisted db.url";
    if (cli.url) name = "db.url";
    else if (envUrl) name = env["FULCRUM_DATABASE_URL"] ? "FULCRUM_DATABASE_URL" : "DATABASE_URL";
    assertPostgresUrl(name, url);
    return { backend, url };
  }

  return {
    backend: "pglite",
    dataDir: cli.dataDir ?? persisted.dataDir ?? defaultLocalPgliteDataDir(env),
  };
}

export async function openDatabase(
  config: ResolvedDatabaseConfig = resolveDatabaseConfig(),
): Promise<SqlExecutor> {
  if (config.backend === "postgres") return openPostgresSqlStore(config.url);
  await mkdir(config.dataDir, { recursive: true });
  return openLocalSqlStore(config.dataDir);
}
