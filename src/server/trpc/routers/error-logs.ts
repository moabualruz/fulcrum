import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { ErrorLog } from "../../../db/entities/platform/ErrorLog.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import type { AuthenticatedContext } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

export interface ErrorLogRecord {
  id: string;
  orgId: string;
  userId: string | null;
  occurredAt: Date;
  os?: string | null;
  arch?: string | null;
  bunVersion?: string | null;
  fulcrumVersion?: string | null;
  recentCliCommand?: string | null;
  recentTrpcProcedure?: string | null;
  errorMessage: string;
  stackTrace?: string | null;
  context: Record<string, unknown>;
}

export abstract class ErrorLogStore {
  abstract list(orgId: string, input: { limit: number; since?: Date }): Promise<ErrorLogRecord[]>;
  abstract get(orgId: string, id: string): Promise<ErrorLogRecord | null>;
  abstract clear(orgId: string, input: { before?: Date }): Promise<number>;
}

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

function entityToRecord(entity: ErrorLog): ErrorLogRecord {
  const org = entity.org as unknown as { id?: string } | string;
  const user = entity.user as unknown as { id?: string } | string | undefined;

  return {
    id: entity.id,
    orgId: typeof org === "string" ? org : org.id ?? "",
    userId: user ? (typeof user === "string" ? user : user.id ?? null) : null,
    occurredAt: entity.occurredAt,
    os: entity.os ?? null,
    arch: entity.arch ?? null,
    bunVersion: entity.bunVersion ?? null,
    fulcrumVersion: entity.fulcrumVersion ?? null,
    recentCliCommand: entity.recentCliCommand ?? null,
    recentTrpcProcedure: entity.recentTrpcProcedure ?? null,
    errorMessage: entity.errorMessage,
    stackTrace: entity.stackTrace ?? null,
    context: entity.context ?? {},
  };
}

class MikroErrorLogStore extends ErrorLogStore {
  constructor(private readonly ctx: AuthenticatedContext) {
    super();
  }

  private repo() {
    if (!this.ctx.em) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error log repository is not configured.",
      });
    }
    return this.ctx.em.getRepository(ErrorLog);
  }

  async list(orgId: string, input: { limit: number; since?: Date }) {
    const where = input.since
      ? { org: orgId, occurredAt: { $gte: input.since } }
      : { org: orgId };
    const rows = await this.repo().find(where as never, {
      orderBy: { occurredAt: "DESC" },
      limit: input.limit,
    });
    return rows.map(entityToRecord);
  }

  async get(orgId: string, id: string) {
    const row = await this.repo().findOne({ id, org: orgId } as never);
    return row ? entityToRecord(row) : null;
  }

  async clear(orgId: string, input: { before?: Date }) {
    const where = input.before
      ? { org: orgId, occurredAt: { $lt: input.before } }
      : { org: orgId };
    const rows = await this.repo().find(where as never);
    this.ctx.em!.remove(rows);
    await this.ctx.em!.flush();
    return rows.length;
  }
}

function storeFromContext(ctx: AuthenticatedContext): ErrorLogStore {
  if (ctx.container?.has(ErrorLogStore)) return ctx.container.get(ErrorLogStore);
  return new MikroErrorLogStore(ctx);
}

export const errorLogsRouter = t.router({
  list: permissionedProcedure({ resource: "error_logs", action: "list" })
    .input(ListInputSchema)
    .output(z.array(ErrorLogOutputSchema))
    .query(({ ctx, input }) => storeFromContext(ctx).list(ctx.orgId, input)),

  get: permissionedProcedure({ resource: "error_logs", action: "get" })
    .input(GetInputSchema)
    .output(ErrorLogOutputSchema.nullable())
    .query(({ ctx, input }) => storeFromContext(ctx).get(ctx.orgId, input.id)),

  clear: permissionedProcedure({ resource: "error_logs", action: "clear" })
    .input(ClearInputSchema)
    .output(z.object({ ok: z.literal(true), deleted: z.number().int().nonnegative() }))
    .mutation(async ({ ctx, input }) => ({
      ok: true as const,
      deleted: await storeFromContext(ctx).clear(ctx.orgId, input),
    })),
});
