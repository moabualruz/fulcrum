import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { openPostgres } from "../product-kernel/db/postgres.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";

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
  if (persistedUrl) return persistedUrl;
  if (backend === "postgres" && envUrl) return envUrl;
  return undefined;
}

export function resolveDatabaseConfig(input: DatabaseConfigInput = {}): ResolvedDatabaseConfig {
  const env = input.env ?? process.env;
  const persisted = input.config?.db ?? {};
  const cli = input.cli ?? {};
  const envUrl = env["DATABASE_URL"];

  const backend =
    normalizeBackend(cli.backend) ??
    normalizeBackend(persisted.backend) ??
    (envUrl?.startsWith("postgresql://") || envUrl?.startsWith("postgres://") ? "postgres" : "pglite");

  if (backend === "postgres") {
    const url = postgresUrlFrom(backend, cli.url, persisted.url, envUrl);
    if (!url) {
      throw new Error("PostgreSQL backend requires --url, persisted db.url, or DATABASE_URL");
    }
    return { backend, url };
  }

  return {
    backend: "pglite",
    dataDir: cli.dataDir ?? persisted.dataDir ?? join(fulcrumHome(env), "pglite.data"),
  };
}

export async function openDatabase(
  config: ResolvedDatabaseConfig = resolveDatabaseConfig(),
): Promise<ProductDb> {
  if (config.backend === "postgres") return openPostgres(config.url);
  await mkdir(config.dataDir, { recursive: true });
  return openPglite(config.dataDir);
}
