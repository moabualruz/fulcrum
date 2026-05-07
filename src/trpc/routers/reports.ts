/**
 * Reports sub-router — Pillar 6, Issue 20 (burndown chart).
 *
 * `reports.burndown({projectId, sprintId})` returns `{date, pointsRemaining, ideal}[]`.
 * Reads from `metrics_cache`; falls back to on-demand computation when cache is empty.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getSprintBurndown } from "../../application/reports/queries.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

const BurndownInputSchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid(),
});

const BurndownPointSchema = z.object({
  date: z.string(),
  pointsRemaining: z.number(),
  ideal: z.number(),
});

const BurndownOutputSchema = z.array(BurndownPointSchema);

function requireEm(context: { em: EntityManager | null }): EntityManager {
  if (!context.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager required for reports.",
    });
  }
  return context.em;
}

export interface BurndownPoint {
  date: string;
  pointsRemaining: number;
  ideal: number;
}

export const reportsRouter = t.router({
  burndown: permissionedProcedure({ resource: "reports", action: "burndown" })
    .input(BurndownInputSchema)
    .output(BurndownOutputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getSprintBurndown(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),
});

export type ReportsRouter = typeof reportsRouter;
