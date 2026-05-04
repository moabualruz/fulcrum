/**
 * Reports sub-router — Pillar 6, Issue 20 (burndown chart).
 *
 * `reports.burndown({projectId, sprintId})` returns `{date, pointsRemaining, ideal}[]`.
 * Reads from `metrics_cache`; falls back to on-demand computation when cache is empty.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { MetricsCache } from "../../db/entities/tasks/MetricsCache.ts";
import { Sprint } from "../../db/entities/tasks/Sprint.ts";
import { protectedProcedure } from "../middleware.ts";
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

function requireEm(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager required for reports.",
    });
  }
  return ctx.em;
}

/** Day count between two dates (inclusive of start, exclusive of end). */
function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface BurndownPoint {
  date: string;
  pointsRemaining: number;
  ideal: number;
}

/**
 * Compute burndown from metrics_cache.
 * Falls back to on-demand computation (task sum) when cache is empty.
 */
async function computeBurndown(
  em: EntityManager,
  orgId: string,
  projectId: string,
  sprintId: string,
): Promise<BurndownPoint[]> {
  // Load sprint
  const sprint = await em.findOne(Sprint, { id: sprintId, org: orgId } as never);
  if (!sprint) return [];

  const totalDays = daysBetween(sprint.startDate, sprint.endDate);

  // Total story points in sprint
  const pointsRows = await em.getConnection().execute(
    `SELECT coalesce(sum(points), 0)::int AS total FROM tasks WHERE sprint_id = ? AND deleted_at IS NULL`,
    [sprintId],
  ) as Array<{ total: number }>;
  const totalPoints = pointsRows[0]?.total ?? 0;
  if (totalPoints === 0) return [];

  // Try metrics_cache first
  const cached = await em.find(MetricsCache, {
    projectId,
    sprint: sprintId,
  } as never, {
    orderBy: { date: "ASC" },
  });

  // Build actual lookup from cache
  const actualMap = new Map<string, number>();
  for (const mc of cached) {
    actualMap.set(dateStr(mc.date), mc.pointsRemaining);
  }

  const hasCachedData = cached.length > 0;

  // On-demand fallback: compute current remaining from tasks
  let onDemandRemaining = totalPoints;
  if (!hasCachedData) {
    const doneRows = await em.getConnection().execute(
      `SELECT coalesce(sum(points), 0)::int AS done FROM tasks WHERE sprint_id = ? AND deleted_at IS NULL AND status IN ('done', 'completed', 'closed')`,
      [sprintId],
    ) as Array<{ done: number }>;
    onDemandRemaining = totalPoints - (doneRows[0]?.done ?? 0);
  }

  const pointsPerDay = totalPoints / totalDays;
  const points: BurndownPoint[] = [];

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(sprint.startDate.getTime() + d * 86400000);
    const ds = dateStr(date);
    const ideal = Math.round(Math.max(0, totalPoints - pointsPerDay * d) * 100) / 100;

    let remaining: number;
    if (hasCachedData) {
      const cached = actualMap.get(ds);
      // Use cached value, or carry forward last known value
      if (cached !== undefined) {
        remaining = cached;
      } else if (d === 0) {
        remaining = totalPoints;
      } else {
        // Carry forward last known actual (or totalPoints if none yet)
        remaining = points.length > 0 ? points[points.length - 1]!.pointsRemaining : totalPoints;
      }
    } else {
      // Fallback: day 0 = total, rest = on-demand remaining
      remaining = d === 0 ? totalPoints : onDemandRemaining;
    }

    points.push({ date: ds, pointsRemaining: remaining, ideal: d === totalDays ? 0 : ideal });
  }

  return points;
}

export const reportsRouter = t.router({
  burndown: protectedProcedure
    .input(BurndownInputSchema)
    .output(BurndownOutputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return computeBurndown(em, ctx.orgId, input.projectId, input.sprintId);
    }),
});

export type ReportsRouter = typeof reportsRouter;
