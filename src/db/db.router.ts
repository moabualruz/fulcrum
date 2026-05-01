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
 * ⚠️  FLAG (P1#06): Permission gating (`assertPermission()`) is owned by
 *     Pillar 1 issue #06 (auth / Better-Auth middleware). Calls are marked
 *     with TODO comments below; add real gate when #06 lands.
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

/**
 * Thrown by `assertPermission` until P1#06 (Better-Auth + permission middleware) lands.
 *
 * Consumers MUST catch this error or stub it in tests.
 * When P1#06 ships, replace `assertPermission` body with a real gate and remove
 * the `throw` — callers that catch this class will automatically recover.
 *
 * code: 'PERMISSION_NOT_AVAILABLE'
 */
export class PermissionNotAvailableError extends Error {
  readonly code = "PERMISSION_NOT_AVAILABLE" as const;
  constructor() {
    super("Permission middleware not yet wired (Pillar 1 #06 owns)");
    this.name = "PermissionNotAvailableError";
  }
}

/**
 * assertPermission — THROWS until P1#06 (auth middleware) lands.
 *
 * Intentionally fail-closed: any call to a db.router procedure throws
 * PermissionNotAvailableError so callers fail loudly, not silently allow.
 * This prevents accidental unauthenticated access before the auth gate is wired.
 *
 * TODO(P1#06): Replace body with real permission gate from Better-Auth / casbin.
 * When that lands, remove the throw and implement the real check.
 */
function assertPermission(..._args: unknown[]): never {
  throw new PermissionNotAvailableError();
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
  assertPermission(container, "db.migrate");
  /* istanbul ignore next — assertPermission always throws until P1#06 lands */
  const service = container!.get(MigratorService);
  await service.migrate(input.targetVersion, input.force ?? false);
}

/**
 * db.status — returns current migration version + pending count.
 */
export async function dbStatus(
  container: Container | null,
): Promise<MigrationStatus> {
  assertPermission(container, "db.status");
  /* istanbul ignore next — assertPermission always throws until P1#06 lands */
  return container!.get(MigratorService).status();
}

/**
 * db.history — returns the full schema_migrations audit ledger.
 */
export async function dbHistory(
  container: Container | null,
): Promise<SchemaMigration[]> {
  assertPermission(container, "db.history");
  /* istanbul ignore next — assertPermission always throws until P1#06 lands */
  return container!.get(MigratorService).history();
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
