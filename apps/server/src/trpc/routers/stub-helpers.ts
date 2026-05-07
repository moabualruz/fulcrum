/**
 * Shared stub-router helpers.
 *
 * These produce placeholder CRUD procedures that domain pillars will
 * eventually replace with real implementations.  Extracted from the root
 * router to keep it declarative (mounts only, no inline logic).
 */

import { z } from "zod";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";

export const EmptyInputSchema = z.void();
export const IdInputSchema = z.object({ id: z.string().min(1) });
export const OptionalRecordInputSchema = z.record(z.string(), z.unknown()).optional();

export const StubRowSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable(),
});

export const StubOperationOutputSchema = z.object({
  ok: z.literal(true),
  domain: z.string(),
  procedure: z.string(),
  requestId: z.string().nullable(),
});

export function op(ctx: { requestId: string | null }, domain: string, procedure: string) {
  return {
    ok: true as const,
    domain,
    procedure,
    requestId: ctx.requestId,
  };
}

export function listProcedure(domain: string) {
  return permissionedProcedure({ resource: domain, action: "list" })
    .input(EmptyInputSchema)
    .output(z.array(StubRowSchema))
    .query(() => []);
}

export function getProcedure(domain: string) {
  return permissionedProcedure({ resource: domain, action: "get" })
    .input(IdInputSchema)
    .output(StubRowSchema.nullable())
    .query(() => null);
}

export function mutationProcedure(domain: string, procedure: string) {
  return permissionedProcedure({ resource: domain, action: procedure })
    .input(OptionalRecordInputSchema)
    .output(StubOperationOutputSchema)
    .mutation(({ ctx }) => op(ctx, domain, procedure));
}

export function idMutationProcedure(domain: string, procedure: string) {
  return permissionedProcedure({ resource: domain, action: procedure })
    .input(IdInputSchema)
    .output(StubOperationOutputSchema)
    .mutation(({ ctx }) => op(ctx, domain, procedure));
}

export function crudProcedures(domain: string) {
  return {
    list: listProcedure(domain),
    get: getProcedure(domain),
    create: mutationProcedure(domain, "create"),
    update: mutationProcedure(domain, "update"),
    delete: idMutationProcedure(domain, "delete"),
  };
}

export function crudRouter(domain: string) {
  return t.router(crudProcedures(domain));
}
