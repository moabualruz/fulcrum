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

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { ReportService } from "../../../services/ReportService.ts";
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

function requireEm(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager required for reports.",
    });
  }
  return ctx.em;
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
      const svc = new ReportService(em);
      return svc.getBurndown(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  burnup: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getBurnup(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  velocity: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema.extend({ lastN: z.number().int().min(1).max(52).default(10) }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getVelocity(ctx.orgId, input.scopeType, input.scopeId, input.lastN);
    }),

  cfd: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getCfd(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  cycleTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getCycleTime(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  leadTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getLeadTime(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  throughput: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getThroughput(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  wipOverTime: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeWithDateRangeSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getWipOverTime(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        parseDateRange(input.dateRange),
      );
    }),

  workload: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getWorkload(ctx.orgId, input.scopeType, input.scopeId);
    }),

  blockedItems: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getBlockedItems(ctx.orgId, input.scopeType, input.scopeId);
    }),

  staleIssues: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema.extend({ thresholdDays: z.number().int().min(1).default(14) }))
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getStaleIssues(
        ctx.orgId,
        input.scopeType,
        input.scopeId,
        input.thresholdDays,
      );
    }),

  progressRollup: permissionedProcedure({ resource: "reports", action: "list" })
    .input(ScopeInputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const svc = new ReportService(em);
      return svc.getProgressRollup(ctx.orgId, input.scopeType, input.scopeId);
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
      const svc = new ReportService(em);
      const dr = parseDateRange(input.dateRange);
      const { scopeType, scopeId, reportType } = input;
      const orgId = ctx.orgId;

      let data: Array<Record<string, unknown>>;

      switch (reportType) {
        case "burndown":
          data = await svc.getBurndown(orgId, scopeType, scopeId, dr) as never;
          break;
        case "burnup":
          data = await svc.getBurnup(orgId, scopeType, scopeId, dr) as never;
          break;
        case "velocity":
          data = await svc.getVelocity(orgId, scopeType, scopeId, input.lastN) as never;
          break;
        case "cfd":
          data = (await svc.getCfd(orgId, scopeType, scopeId, dr)).map((d) => ({
            date: d.date,
            ...d.statusCounts,
          }));
          break;
        case "cycleTime":
          data = await svc.getCycleTime(orgId, scopeType, scopeId, dr) as never;
          break;
        case "leadTime":
          data = await svc.getLeadTime(orgId, scopeType, scopeId, dr) as never;
          break;
        case "throughput":
          data = await svc.getThroughput(orgId, scopeType, scopeId, dr) as never;
          break;
        case "wipOverTime":
          data = await svc.getWipOverTime(orgId, scopeType, scopeId, dr) as never;
          break;
        case "workload":
          data = await svc.getWorkload(orgId, scopeType, scopeId) as never;
          break;
        case "blockedItems":
          data = await svc.getBlockedItems(orgId, scopeType, scopeId) as never;
          break;
        case "staleIssues":
          data = await svc.getStaleIssues(orgId, scopeType, scopeId, input.thresholdDays) as never;
          break;
        case "progressRollup": {
          const rollup = await svc.getProgressRollup(orgId, scopeType, scopeId);
          data = [rollup as never];
          break;
        }
        default:
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown reportType: ${reportType}` });
      }

      return svc.exportCsv(reportType, data);
    }),

});

export type ReportsRouter = typeof reportsRouter;
