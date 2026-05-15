import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTelemetryStore,
  scrubTelemetryPayload,
  TelemetryStore,
  writeTelemetryEvent,
} from "@platform-core/application/telemetry/commands.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const EmptyInputSchema = z.object({}).default({});
const StatusOutputSchema = z.object({
  opted_in: z.boolean(),
  row_count: z.number().int().nonnegative(),
});
const OkOutputSchema = z.object({ ok: z.literal(true) });
const PurgeOutputSchema = z.object({
  ok: z.literal(true),
  deleted: z.number().int().nonnegative(),
});

export { scrubTelemetryPayload, TelemetryStore, writeTelemetryEvent };

function storeFromContext(context: { container: import("@platform-core/application/runtime/di-container.ts").DiContainer | null; em: import("typeorm").EntityManager | null; orgId: string; userId: string }): TelemetryStore {
  if (context.container?.has(TelemetryStore)) return context.container.get(TelemetryStore);
  return createTelemetryStore({ em: context.em, orgId: context.orgId, userId: context.userId });
}

export const telemetryRouter = t.router({
  status: permissionedProcedure({ resource: "telemetry", action: "status" })
    .input(EmptyInputSchema)
    .output(StatusOutputSchema)
    .query(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      return {
        opted_in: await store.getOptedIn(ctx.orgId),
        row_count: await store.count(ctx.orgId),
      };
    }),

  optIn: permissionedProcedure({ resource: "telemetry", action: "optIn" })
    .input(EmptyInputSchema)
    .output(OkOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      await store.setOptedIn(true, ctx.orgId);
      await store.recordAudit("opted_in", { optedIn: true }, ctx.orgId);
      return { ok: true as const };
    }),

  optOut: permissionedProcedure({ resource: "telemetry", action: "optOut" })
    .input(EmptyInputSchema)
    .output(OkOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      await store.setOptedIn(false, ctx.orgId);
      await store.recordAudit("opted_out", { optedIn: false }, ctx.orgId);
      return { ok: true as const };
    }),

  purge: permissionedProcedure({ resource: "telemetry", action: "purge" })
    .input(EmptyInputSchema)
    .output(PurgeOutputSchema)
    .mutation(async ({ ctx }) => {
      const store = storeFromContext(ctx);
      const deleted = await store.purge(ctx.orgId);
      await store.recordAudit("purged", { deleted }, ctx.orgId);
      return { ok: true as const, deleted };
    }),
});
