/**
 * db.router — database management API procedures.
 *
 * ⚠️  FLAG (P1#19): tRPC (@trpc/server) and Zod are NOT yet in package.json
 *     dependencies. Per decision A6 (DECISIONS.md), Pillar 1 ships a tRPC
 *     skeleton and Pillar 13 finalizes signatures + OpenAPI.
 *     This file defines the procedure SHAPES as plain async functions with
 *     typed inputs/outputs so the tRPC wiring can be dropped in without
 *     changing business logic when Pillar 13 adds @trpc/server + zod.
 *
 * Procedures (mirroring future tRPC shape):
 *   db.migrate(input: { targetVersion?, force? }) → void
 *   db.status()                                   → MigrationStatus
 *   db.history()                                  → SchemaMigration[]
 *
 * C6: No raw SQL.
 * C8: Resolves MigratorService from needle-di Container.
 */

import type { Container } from "@needle-di/core";
import type { MigrationStatus } from "./migrator-service.ts";
import { MigratorService } from "./migrator-service.ts";
import type { SchemaMigration } from "./entities/SchemaMigration.ts";

/** Input type for db.migrate procedure. */
export interface DbMigrateInput {
  targetVersion?: string | number;
  force?: boolean;
}

/** Thrown when a caller uses the db router without the CLI/web DI container. */
export class PermissionNotAvailableError extends Error {
  readonly code = "PERMISSION_NOT_AVAILABLE" as const;
  constructor() {
    super("Database command requires a wired CLI context");
    this.name = "PermissionNotAvailableError";
  }
}

function requireContainer(container: Container | null): Container {
  if (!container) throw new PermissionNotAvailableError();
  return container;
}

/**
 * db.migrate — run migrations to a target version (or latest if unspecified).
 *
 * @throws if targetVersion is unknown, or if a lossy-down is attempted without force.
 */
export async function dbMigrate(
  container: Container | null,
  input: DbMigrateInput = {},
): Promise<void> {
  const service = requireContainer(container).get(MigratorService);
  await service.migrate(input.targetVersion, input.force ?? false);
}

/**
 * db.status — returns current migration version + pending count.
 */
export async function dbStatus(
  container: Container | null,
): Promise<MigrationStatus> {
  return requireContainer(container).get(MigratorService).status();
}

/**
 * db.history — returns the full schema_migrations audit ledger.
 */
export async function dbHistory(
  container: Container | null,
): Promise<SchemaMigration[]> {
  return requireContainer(container).get(MigratorService).history();
}

/**
 * Minimal router object — mirrors the tRPC procedure surface so callers
 * can use `dbRouter.migrate(container, input)` syntax now and the future
 * tRPC codegen can replace this shim without touching call-sites.
 *
 * When @trpc/server is added:
 *   export const dbRouter = router({
 *     migrate: protectedProcedure.input(z.object({...})).mutation(({ ctx, input }) => dbMigrate(ctx.container, input)),
 *     status:  protectedProcedure.query(({ ctx }) => dbStatus(ctx.container)),
 *     history: protectedProcedure.query(({ ctx }) => dbHistory(ctx.container)),
 *   });
 */
export const dbRouter = {
  migrate: dbMigrate,
  status: dbStatus,
  history: dbHistory,
} as const;
