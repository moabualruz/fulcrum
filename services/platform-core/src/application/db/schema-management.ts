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
