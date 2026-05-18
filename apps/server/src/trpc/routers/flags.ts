import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  evaluateFlag,
  listFeatureFlags,
  setFeatureFlag,
  setFlagOverride,
  setFlagRollout,
  type AdminAppContext,
} from "@identity-access/application/admin/queries.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { experimentStore } from "@feature-flags/application/experiments.ts";
import { FEATURE_FLAGS } from "@feature-flags/application/registry.ts";
import { isFeatureEnabled } from "@fulcrum/tui/feature-flags.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const flagNameSchema = z.enum(FEATURE_FLAGS);
const rolloutPercentSchema = z.number().int().min(0).max(100);

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

export const flagsRouter = t.router({
  list: permissionedProcedure({ resource: "flags", action: "list" })
    .query(async ({ ctx }) => mapAppError(() => listFeatureFlags(appContext(ctx)))),

  set: permissionedProcedure({ resource: "flags", action: "set" })
    .input(z.object({
      flag: flagNameSchema,
      enabled: z.boolean(),
      orgId: z.string().uuid().optional(),
      userId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => mapAppError(() => setFeatureFlag(appContext(ctx), input))),

  evaluate: permissionedProcedure({ resource: "flags", action: "evaluate" })
    .input(z.object({
      flag: flagNameSchema,
      orgId: z.string().uuid(),
      userId: z.string().min(1),
    }))
    .query(async ({ ctx, input }): Promise<{ enabled: boolean }> => mapAppError(() => evaluateFlag(appContext(ctx), input))),

  setOverride: permissionedProcedure({ resource: "flags", action: "setOverride" })
    .input(z.object({
      flag: flagNameSchema,
      orgId: z.string().uuid(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => mapAppError(() => setFlagOverride(appContext(ctx), input))),

  setRollout: permissionedProcedure({ resource: "flags", action: "setRollout" })
    .input(z.object({
      flag: flagNameSchema,
      rolloutPercent: rolloutPercentSchema,
      orgId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => mapAppError(() => setFlagRollout(appContext(ctx), input))),

  experiments: t.router({
    list: permissionedProcedure({ resource: "flags", action: "list" })
      .output(z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        variants: z.array(z.string()),
        rolloutPercent: z.number(),
        startDate: z.date().nullable(),
        endDate: z.date().nullable(),
        createdAt: z.date(),
      })))
      .query(() => {
        if (!isFeatureEnabled("experiments")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "FEATURE_DISABLED" });
        }
        return experimentStore.list();
      }),

    create: permissionedProcedure({ resource: "flags", action: "create" })
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        variants: z.array(z.string().min(1)).min(2),
        rolloutPercent: z.number().int().min(0).max(100).default(100),
        startDate: z.date().optional().nullable(),
        endDate: z.date().optional().nullable(),
      }))
      .output(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        variants: z.array(z.string()),
        rolloutPercent: z.number(),
        startDate: z.date().nullable(),
        endDate: z.date().nullable(),
        createdAt: z.date(),
      }))
      .mutation(({ input }) => {
        if (!isFeatureEnabled("experiments")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "FEATURE_DISABLED" });
        }
        if (new Set(input.variants).size !== input.variants.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Variant names must be unique." });
        }
        return experimentStore.create(input);
      }),

    assignments: permissionedProcedure({ resource: "flags", action: "assignments" })
      .input(z.object({ experimentId: z.string() }))
      .output(z.record(z.string(), z.number()))
      .query(({ input }) => {
        if (!isFeatureEnabled("experiments")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "FEATURE_DISABLED" });
        }
        return experimentStore.assignments(input.experimentId);
      }),

    metrics: permissionedProcedure({ resource: "flags", action: "metrics" })
      .input(z.object({ experimentId: z.string(), conversionKind: z.string() }))
      .output(z.record(z.string(), z.object({ assigned: z.number(), conversions: z.number() })))
      .query(({ input }) => {
        if (!isFeatureEnabled("experiments")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "FEATURE_DISABLED" });
        }
        return experimentStore.metrics(input.experimentId, input.conversionKind);
      }),
  }),
});
