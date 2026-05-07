import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { setRetentionPolicy } from "../../../application/audit/commands.ts";
import {
  exportAuditEvents,
  getRetentionPolicy,
  listRetentionPolicies,
  queryAuditEvents,
} from "../../../application/audit/queries.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const UuidLikeSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const AuditFilterSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  projectId: UuidLikeSchema.optional(),
  userId: UuidLikeSchema.optional(),
  subjectKind: z.string().trim().min(1).optional(),
  verb: z.string().trim().min(1).optional(),
  dateRange: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
});

const AuditQueryInputSchema = AuditFilterSchema.extend({
  limit: z.number().int().positive().max(1000).default(50),
  offset: z.number().int().nonnegative().default(0),
}).optional();

const AuditExportInputSchema = AuditFilterSchema.extend({
  format: z.enum(["csv", "json"]),
}).optional();

const AuditEventOutputSchema = z.object({
  id: UuidLikeSchema,
  orgId: UuidLikeSchema,
  userId: UuidLikeSchema.nullable(),
  verb: z.string(),
  subjectKind: z.string(),
  subjectId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

const AuditQueryOutputSchema = z.object({
  items: z.array(AuditEventOutputSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

const AuditExportOutputSchema = z.union([
  z.object({ format: z.literal("json"), rows: z.array(AuditEventOutputSchema) }),
  z.object({ format: z.literal("csv"), csv: z.string() }),
  z.object({ jobId: z.string() }),
]);

const RetentionPolicyInputSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  projectId: UuidLikeSchema.nullable().optional(),
});

const RetentionPolicySetInputSchema = z.object({
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable().optional(),
  retainDays: z.number().int().nonnegative(),
});

const RetentionPolicyOutputSchema = z.object({
  id: UuidLikeSchema,
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable(),
  retainDays: z.number().int().nonnegative(),
});

const auditApplication = {
  queryAuditEvents,
  exportAuditEvents,
  getRetentionPolicy,
  listRetentionPolicies,
  setRetentionPolicy,
};

export function __setAuditApplicationForTest(overrides: Partial<typeof auditApplication>): () => void {
  const previous = { ...auditApplication };
  Object.assign(auditApplication, overrides);
  return () => Object.assign(auditApplication, previous);
}

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (ctx.em) return ctx.em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }) {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const auditRouter = t.router({
  query: permissionedProcedure({ resource: "audit", action: "query" })
    .input(AuditQueryInputSchema)
    .output(AuditQueryOutputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() => auditApplication.queryAuditEvents(requireEntityManager(ctx), appContext(ctx), input ?? {}))
    ),

  export: permissionedProcedure({ resource: "audit", action: "export" })
    .input(AuditExportInputSchema)
    .output(AuditExportOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => auditApplication.exportAuditEvents(requireEntityManager(ctx), appContext(ctx), input ?? {}))
    ),

  retentionPolicy: t.router({
    get: permissionedProcedure({ resource: "audit", action: "get" })
      .input(RetentionPolicyInputSchema.optional())
      .output(RetentionPolicyOutputSchema.nullable())
      .query(({ ctx, input }) =>
        mapAppError(() => auditApplication.getRetentionPolicy(requireEntityManager(ctx), appContext(ctx), input ?? {}))
      ),

    list: permissionedProcedure({ resource: "audit", action: "list" })
      .input(RetentionPolicyInputSchema.optional())
      .output(z.array(RetentionPolicyOutputSchema))
      .query(({ ctx, input }) =>
        mapAppError(() => auditApplication.listRetentionPolicies(requireEntityManager(ctx), appContext(ctx), input ?? {}))
      ),

    set: permissionedProcedure({ resource: "audit", action: "set" })
      .input(RetentionPolicySetInputSchema)
      .output(RetentionPolicyOutputSchema)
      .mutation(({ ctx, input }) =>
        mapAppError(() => auditApplication.setRetentionPolicy(requireEntityManager(ctx), appContext(ctx), input))
      ),
  }),
});

export type AuditRouter = typeof auditRouter;
