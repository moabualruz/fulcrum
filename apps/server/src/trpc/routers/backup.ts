import { z } from "zod";

import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  backupEntityCounts,
  createBackupDump,
  decodeBackupDump,
  encodeBackupDump,
  restoreBackupDump,
  type AdminAppContext,
} from "@identity-access/application/admin/queries.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const BackupOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  dump: z.string(),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

const RestoreInputSchema = z.object({ dump: z.string().min(1) });

const RestoreOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

function appContext({ orgId, userId, em, container }: AdminAppContext): AdminAppContext {
  return { orgId, userId, em, container };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const backupRouter = t.router({
  create: permissionedProcedure({ resource: "backup", action: "create" })
    .output(BackupOutputSchema)
    .mutation(async ({ ctx }) => {
      const dump = await mapAppError(() => createBackupDump(appContext(ctx)));
      return {
        ok: true as const,
        format: BACKUP_FORMAT,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        dump: encodeBackupDump(dump),
        entityCounts: backupEntityCounts(dump),
      };
    }),

  restore: permissionedProcedure({ resource: "backup", action: "restore" })
    .input(RestoreInputSchema)
    .output(RestoreOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const dump = await mapAppError(() => decodeBackupDump(input.dump));
      await mapAppError(() => restoreBackupDump(appContext(ctx), dump));
      return {
        ok: true as const,
        format: BACKUP_FORMAT,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        entityCounts: backupEntityCounts(dump),
      };
    }),
});
