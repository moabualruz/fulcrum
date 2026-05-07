import { z } from "zod";

import {
  clearErrorLogs,
  ErrorLogStore,
  getErrorLog,
  listErrorLogs,
  type AdminAppContext,
  type ErrorLogRecord,
} from "@/application/admin/queries.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

export { ErrorLogStore, type ErrorLogRecord };

const IsoDateInputSchema = z.string().datetime().transform((value) => new Date(value));
const ListInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  since: IsoDateInputSchema.optional(),
}).default({ limit: 20 });
const GetInputSchema = z.object({ id: z.string().min(1) });
const ClearInputSchema = z.object({ before: IsoDateInputSchema.optional() }).default({});

const ErrorLogOutputSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string().nullable(),
  occurredAt: z.date(),
  os: z.string().nullable().optional(),
  arch: z.string().nullable().optional(),
  bunVersion: z.string().nullable().optional(),
  fulcrumVersion: z.string().nullable().optional(),
  recentCliCommand: z.string().nullable().optional(),
  recentTrpcProcedure: z.string().nullable().optional(),
  errorMessage: z.string(),
  stackTrace: z.string().nullable().optional(),
  context: z.record(z.string(), z.unknown()),
});

function appContext({ orgId, userId, em, container }: AdminAppContext): AdminAppContext {
  return { orgId, userId, em, container };
}

export const errorLogsRouter = t.router({
  list: permissionedProcedure({ resource: "error_logs", action: "list" })
    .input(ListInputSchema)
    .output(z.array(ErrorLogOutputSchema))
    .query(({ ctx, input }) => listErrorLogs(appContext(ctx), input)),

  get: permissionedProcedure({ resource: "error_logs", action: "get" })
    .input(GetInputSchema)
    .output(ErrorLogOutputSchema.nullable())
    .query(({ ctx, input }) => getErrorLog(appContext(ctx), input.id)),

  clear: permissionedProcedure({ resource: "error_logs", action: "clear" })
    .input(ClearInputSchema)
    .output(z.object({ ok: z.literal(true), deleted: z.number().int().nonnegative() }))
    .mutation(async ({ ctx, input }) => ({
      ok: true as const,
      deleted: await clearErrorLogs(appContext(ctx), input),
    })),
});
