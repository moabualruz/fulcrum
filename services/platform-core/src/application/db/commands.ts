import { resolveDatabaseConfig, type DbBackend, type ResolvedDatabaseConfig } from "./database-config.ts";
import { resolveApplicationDatabaseRuntime } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

export type ProductDbConnectionSummary =
  | {
    type: "local-pglite";
    dataDir: string;
  }
  | {
    type: "postgres";
    url: string;
  };

export interface ProductDbStatus {
  backend: DbBackend;
  connection: ProductDbConnectionSummary;
  runtime: ReturnType<typeof resolveApplicationDatabaseRuntime>;
  current: string | null;
  pending: string[];
  pastDue: number;
  ok: true;
}

function redactDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (url.password) url.password = "***";
  return url.toString();
}

function describeDatabaseConnection(config: ResolvedDatabaseConfig): ProductDbConnectionSummary {
  if (config.backend === "postgres") {
    return { type: "postgres", url: redactDatabaseUrl(config.url) };
  }
  return { type: "local-pglite", dataDir: config.dataDir };
}

export function defaultProductDbStatus(): ProductDbStatus {
  const config = resolveDatabaseConfig();
  return {
    backend: config.backend,
    connection: describeDatabaseConnection(config),
    runtime: resolveApplicationDatabaseRuntime(),
    current: null,
    pending: [],
    pastDue: 0,
    ok: true,
  };
}
