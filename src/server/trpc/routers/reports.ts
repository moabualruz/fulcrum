/**
 * reportsRouter — Plan 05-05.
 *
 * Exposes all ReportService analytics methods as tRPC queries + CSV export mutation.
 * Replaces legacy raw SQL reports page with tRPC-backed service (D-33, D-53, D-54, D-55).
 *
 * Workspace scope supported end-to-end (HIGH-01, D-53, D-95).
 * CSV export (D-54). Date range on all queries (D-55).
 *
 * Security:
 * - All queries use permissionedProcedure with reports resource (T-05-11)
 * - orgId sourced from auth context, never from client input
 *
 * Note: Do NOT modify src/trpc/router.ts — Plan 06 owns that wire-up (HIGH-06).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  exportReportCsv,
  getBlockedItemsReport,
  getBurndownReport,
  getBurnupReport,
  getCfdReport,
  getCycleTimeReport,
  getLeadTimeReport,
  getProgressRollupReport,
  getStaleIssuesReport,
  getThroughputReport,
  getVelocityReport,
  getWipOverTimeReport,
  getWorkloadReport,
} from "../../../application/reports/queries.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import type { EntityManager } from "@mikro-orm/postgresql";

// ── Shared schemas ─────────────────────────────────────────────────

const ScopeTypeSchema = z.enum(["sprint", "project", "epic", "workspace"]);

const DateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const ScopeInputSchema = z.object({
  scopeType: ScopeTypeSchema,
  scopeId: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(), // override for workspace queries (falls back to ctx.orgId)
});

const ScopeWithDateRangeSchema = ScopeInputSchema.extend({
  dateRange: DateRangeSchema,
});

// ── Helpers ────────────────────────────────────────────────────────

function requireEm(context: { em: EntityManager | null }): EntityManager {
  if (!context.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager required for reports.",
    });
  }
  return context.em;
}

function parseDateRange(dr: { start: string; end: string }): { start: Date; end: Date } {
  return { start: new Date(dr.start), end: new Date(dr.end) };
}

// ── Router ─────────────────────────────────────────────────────────

export const reportsRouter = t.router({

  burndown: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getBurndownReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  burnup: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getBurnupReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  velocity: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema.extend({ lastN: z.number().int().min(1).max(52).default(10) }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getVelocityReport(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  cfd: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getCfdReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  cycleTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getCycleTimeReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  leadTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getLeadTimeReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  throughput: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getThroughputReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  wipOverTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getWipOverTimeReport(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
      });
    }),

  workload: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getWorkloadReport(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  blockedItems: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getBlockedItemsReport(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  staleIssues: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema.extend({ thresholdDays: z.number().int().min(1).default(14) }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getStaleIssuesReport(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  progressRollup: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getProgressRollupReport(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  /** CSV export (D-54) — returns CSV string for any report type */
  exportCsv: permissionedProcedure({ resource: "reports", action: "list" })
    .input(
      ScopeWithDateRangeSchema.extend({
        reportType: z.enum([
          "burndown",
          "burnup",
          "velocity",
          "cfd",
          "cycleTime",
          "leadTime",
          "throughput",
          "wipOverTime",
          "workload",
          "blockedItems",
          "staleIssues",
          "progressRollup",
        ]),
        lastN: z.number().int().min(1).max(52).default(10),
        thresholdDays: z.number().int().min(1).default(14),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return exportReportCsv(em, { orgId: ctx.orgId, userId: ctx.userId }, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        dateRange: parseDateRange(input.dateRange),
        reportType: input.reportType,
        lastN: input.lastN,
        thresholdDays: input.thresholdDays,
      });
    }),

});

export type ReportsRouter = typeof reportsRouter;
