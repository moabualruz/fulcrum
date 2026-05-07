import { z } from "zod";

import {
  BACKUP_FORMAT,
  backupEntityCounts,
  createBackupDump,
  decodeBackupDump,
  encodeBackupDump,
  restoreBackupDump,
  type AdminAppContext,
} from "@/application/admin/queries.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const BackupOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(BACKUP_FORMAT),
  dump: z.string(),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

const RestoreInputSchema = z.object({ dump: z.string().min(1) });

const RestoreOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(BACKUP_FORMAT),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

function appContext({ orgId, userId, em, container }: AdminAppContext): AdminAppContext {
  return { orgId, userId, em, container };
}

export const backupRouter = t.router({
  create: permissionedProcedure({ resource: "backup", action: "create" })
    .output(BackupOutputSchema)
    .mutation(async ({ ctx }) => {
      const dump = await createBackupDump(appContext(ctx));
      return {
        ok: true as const,
        format: BACKUP_FORMAT,
        dump: encodeBackupDump(dump),
        entityCounts: backupEntityCounts(dump),
      };
    }),

  restore: permissionedProcedure({ resource: "backup", action: "restore" })
    .input(RestoreInputSchema)
    .output(RestoreOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const dump = decodeBackupDump(input.dump);
      await restoreBackupDump(appContext(ctx), dump);
      return {
        ok: true as const,
        format: BACKUP_FORMAT,
        entityCounts: backupEntityCounts(dump),
      };
    }),
});
