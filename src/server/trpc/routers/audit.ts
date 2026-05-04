import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Event } from "../../../db/entities/core/Event.ts";
import { Org } from "../../../db/entities/auth/Org.ts";
import { User } from "../../../db/entities/auth/User.ts";
import { EventRetentionPolicy } from "../../../db/entities/notifications/EventRetentionPolicy.ts";
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

type AuditFilter = z.infer<typeof AuditFilterSchema>;
type AuditQueryInput = AuditFilter & {
  limit?: number;
  offset?: number;
};
type AuditEventOutput = z.infer<typeof AuditEventOutputSchema>;
type RetentionPolicyOutput = z.infer<typeof RetentionPolicyOutputSchema>;

function requireEntityManager(ctx: { em: import("@mikro-orm/postgresql").EntityManager | null }) {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return ctx.em;
}

function defaultDateRange(): { from: Date; to?: Date } {
  return { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
}

function buildEventWhere(orgId: string, filter: AuditFilter = {}) {
  const range = filter.dateRange ?? defaultDateRange();
  const createdAt: Record<string, Date> = {};
  if (range.from) createdAt.$gte = range.from;
  if (range.to) createdAt.$lte = range.to;

  return {
    org: orgId,
    ...(filter.userId ? { user: filter.userId } : {}),
    ...(filter.subjectKind ? { subjectKind: filter.subjectKind } : {}),
    ...(filter.verb ? { verb: filter.verb } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };
}

function projectMatches(event: Event, projectId: string | undefined): boolean {
  if (!projectId) return true;
  return event.payload?.["projectId"] === projectId;
}

function serializeEvent(event: Event): AuditEventOutput {
  return {
    id: event.id,
    orgId: event.org.id,
    userId: event.user?.id ?? null,
    verb: event.verb,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId ?? null,
    payload: event.payload ?? null,
    createdAt: event.createdAt,
  };
}

async function queryEvents(
  ctx: { orgId: string; em: import("@mikro-orm/postgresql").EntityManager | null },
  input: AuditQueryInput = {},
) {
  const em = requireEntityManager(ctx);
  const orgId = input?.orgId ?? ctx.orgId;
  const limit = input?.limit ?? 50;
  const offset = input?.offset ?? 0;
  const where = buildEventWhere(orgId, input ?? {});

  const rows = await em.find(Event, where, {
    populate: ["org", "user"],
    orderBy: { createdAt: "DESC" },
  });
  const filtered = rows.filter((event) => projectMatches(event, input?.projectId));

  return {
    items: filtered.slice(offset, offset + limit).map(serializeEvent),
    total: filtered.length,
    limit,
    offset,
  };
}

function csvEscape(value: unknown): string {
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? value
      : JSON.stringify(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function toCsv(rows: AuditEventOutput[]): string {
  const headers = [
    "id",
    "org_id",
    "user_id",
    "verb",
    "subject_kind",
    "subject_id",
    "payload",
    "created_at",
  ];
  const lines = rows.map((row) => [
    row.id,
    row.orgId,
    row.userId ?? "",
    row.verb,
    row.subjectKind,
    row.subjectId ?? "",
    row.payload ?? {},
    row.createdAt,
  ].map(csvEscape).join(","));
  return [headers.join(","), ...lines].join("\n");
}

function serializeRetentionPolicy(policy: EventRetentionPolicy): RetentionPolicyOutput {
  return {
    id: policy.id,
    orgId: policy.org.id,
    projectId: policy.projectId ?? null,
    retainDays: policy.retainDays,
  };
}

async function findRetentionPolicy(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  projectId: string | null,
) {
  return em.findOne(EventRetentionPolicy, {
    org: orgId,
    projectId,
  }, { populate: ["org"] });
}

export const auditRouter = t.router({
  query: permissionedProcedure({ resource: "audit", action: "query" })
    .input(AuditQueryInputSchema)
    .output(AuditQueryOutputSchema)
    .query(({ ctx, input }) => queryEvents(ctx, input)),

  export: permissionedProcedure({ resource: "audit", action: "export" })
    .input(AuditExportInputSchema)
    .output(AuditExportOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await queryEvents(ctx, {
        ...(input ?? {}),
        limit: 100_000,
        offset: 0,
      });

      if (result.total > 100_000) {
        return { jobId: crypto.randomUUID() };
      }

      if (input?.format === "csv") {
        return { format: "csv" as const, csv: toCsv(result.items) };
      }

      return { format: "json" as const, rows: result.items };
    }),

  retentionPolicy: t.router({
    get: permissionedProcedure({ resource: "audit", action: "get" })
      .input(RetentionPolicyInputSchema.optional())
      .output(RetentionPolicyOutputSchema.nullable())
      .query(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const orgId = input?.orgId ?? ctx.orgId;
        const projectId = input?.projectId ?? null;
        const policy = await findRetentionPolicy(em, orgId, projectId);
        return policy ? serializeRetentionPolicy(policy) : null;
      }),

    list: permissionedProcedure({ resource: "audit", action: "list" })
      .input(RetentionPolicyInputSchema.optional())
      .output(z.array(RetentionPolicyOutputSchema))
      .query(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const orgId = input?.orgId ?? ctx.orgId;
        const projectId = input?.projectId;
        const rows = await em.find(EventRetentionPolicy, {
          org: orgId,
          ...(projectId !== undefined ? { projectId } : {}),
        }, {
          populate: ["org"],
          orderBy: { projectId: "ASC" },
        });
        return rows.map(serializeRetentionPolicy);
      }),

    set: permissionedProcedure({ resource: "audit", action: "set" })
      .input(RetentionPolicySetInputSchema)
      .output(RetentionPolicyOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const projectId = input.projectId ?? null;
        let policy = await findRetentionPolicy(em, input.orgId, projectId);

        if (!policy) {
          policy = em.create(EventRetentionPolicy, {
            org: em.getReference(Org, input.orgId),
            projectId,
            retainDays: input.retainDays,
          });
          em.persist(policy);
        } else {
          policy.retainDays = input.retainDays;
        }

        await em.flush();
        await em.populate(policy, ["org"]);
        return serializeRetentionPolicy(policy);
      }),
  }),
});

export type AuditRouter = typeof auditRouter;
