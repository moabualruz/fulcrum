import type { EntityManager } from "@mikro-orm/postgresql";

import { MetricsCache } from "../../db/entities/tasks/MetricsCache.ts";
import { Sprint } from "../../db/entities/tasks/Sprint.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import { ReportService } from "../../services/ReportService.ts";
import { AppNotFoundError } from "../errors.ts";
import type {
  AppContext,
  BurndownPoint,
  DateRange,
  ReportExportCsvInput,
  ReportScopeType,
  ReportSnapshotDto,
} from "./types.ts";

export async function listReportSnapshots(
  em: EntityManager,
  _ctx: AppContext,
  input: { projectId: string },
): Promise<ReportSnapshotDto[]> {
  const rows = await em.find(MetricsCache, { projectId: input.projectId } as never, { orderBy: { date: "ASC", id: "ASC" } });
  return rows.map((row) => serializeReportSnapshot(row, _ctx.orgId));
}

export async function getReportSnapshot(em: EntityManager, ctx: AppContext, id: string): Promise<ReportSnapshotDto> {
  const row = await em.findOne(MetricsCache, { id } as never);
  if (!row) throw new AppNotFoundError(`Report snapshot not found: ${id}`);
  return serializeReportSnapshot(row, ctx.orgId);
}

export function serializeReportSnapshot(row: MetricsCache, orgId: string): ReportSnapshotDto {
  return {
    id: row.id,
    orgId,
    projectId: row.projectId,
    scopeType: row.scopeType,
    completedCount: row.completedCount,
    pointsCompleted: row.pointsCompleted,
    date: row.date,
  };
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function dateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toRouterBurndownPoint(point: { date: string; remaining: number; ideal: number }): BurndownPoint {
  return {
    date: point.date,
    pointsRemaining: point.remaining,
    ideal: point.ideal,
  };
}

export async function getSprintBurndown(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string; sprintId: string },
): Promise<BurndownPoint[]> {
  const sprint = await em.findOne(Sprint, {
    id: input.sprintId,
    org: ctx.orgId,
    projectId: input.projectId,
  } as never);
  if (!sprint) return [];

  const tasks = await em.createQueryBuilder(Task, "task")
    .select(["points", "status"])
    .where({ org: ctx.orgId, sprint: input.sprintId, deletedAt: null } as never)
    .execute<Array<{ points: number | null; status: string | null }>>("all", false);
  const totalPoints = tasks.reduce((sum, task) => sum + (task.points ?? 0), 0);
  if (totalPoints === 0) return [];

  const totalDays = daysBetween(sprint.startDate, sprint.endDate);
  const cached = await em.find(MetricsCache, {
    projectId: input.projectId,
    sprint: input.sprintId,
  } as never, {
    orderBy: { date: "ASC" },
  });
  const actualMap = new Map(cached.map((row) => [dateStr(row.date), row.pointsRemaining]));
  const doneStatuses = new Set(["done", "completed", "closed"]);
  const donePoints = tasks.reduce((sum, task) => {
    return doneStatuses.has(task.status ?? "") ? sum + (task.points ?? 0) : sum;
  }, 0);
  const fallbackRemaining = totalPoints - donePoints;
  const pointsPerDay = totalPoints / totalDays;
  const points: BurndownPoint[] = [];

  for (let day = 0; day <= totalDays; day += 1) {
    const date = new Date(sprint.startDate.getTime() + day * 86_400_000);
    const ds = dateStr(date);
    const ideal = Math.round(Math.max(0, totalPoints - pointsPerDay * day) * 100) / 100;
    let pointsRemaining: number;
    if (cached.length > 0) {
      pointsRemaining = actualMap.get(ds) ?? points.at(-1)?.pointsRemaining ?? totalPoints;
    } else {
      pointsRemaining = day === 0 ? totalPoints : fallbackRemaining;
    }
    points.push({ date: ds, pointsRemaining, ideal: day === totalDays ? 0 : ideal });
  }

  return points;
}

export async function getBurndownReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return (await new ReportService(em).getBurndown(ctx.orgId, input.scopeType, input.scopeId, input.dateRange))
    .map(toRouterBurndownPoint);
}

export async function getBurnupReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getBurnup(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getVelocityReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; lastN: number },
) {
  return new ReportService(em).getVelocity(ctx.orgId, input.scopeType, input.scopeId, input.lastN);
}

export async function getCfdReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getCfd(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getCycleTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getCycleTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getLeadTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getLeadTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getThroughputReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getThroughput(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getWipOverTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new ReportService(em).getWipOverTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getWorkloadReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new ReportService(em).getWorkload(ctx.orgId, input.scopeType, input.scopeId);
}

export async function getBlockedItemsReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new ReportService(em).getBlockedItems(ctx.orgId, input.scopeType, input.scopeId);
}

export async function getStaleIssuesReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; thresholdDays: number },
) {
  return new ReportService(em).getStaleIssues(ctx.orgId, input.scopeType, input.scopeId, input.thresholdDays);
}

export async function getProgressRollupReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new ReportService(em).getProgressRollup(ctx.orgId, input.scopeType, input.scopeId);
}

export async function exportReportCsv(
  em: EntityManager,
  ctx: AppContext,
  input: ReportExportCsvInput,
): Promise<string> {
  const service = new ReportService(em);
  const scoped = { scopeType: input.scopeType, scopeId: input.scopeId, dateRange: input.dateRange };
  let data: Array<Record<string, unknown>>;

  switch (input.reportType) {
    case "burndown":
      data = await getBurndownReport(em, ctx, scoped) as never;
      break;
    case "burnup":
      data = await getBurnupReport(em, ctx, scoped) as never;
      break;
    case "velocity":
      data = await getVelocityReport(em, ctx, { scopeType: input.scopeType, scopeId: input.scopeId, lastN: input.lastN }) as never;
      break;
    case "cfd":
      data = (await getCfdReport(em, ctx, scoped)).map((row) => ({ date: row.date, ...row.statusCounts }));
      break;
    case "cycleTime":
      data = await getCycleTimeReport(em, ctx, scoped) as never;
      break;
    case "leadTime":
      data = await getLeadTimeReport(em, ctx, scoped) as never;
      break;
    case "throughput":
      data = await getThroughputReport(em, ctx, scoped) as never;
      break;
    case "wipOverTime":
      data = await getWipOverTimeReport(em, ctx, scoped) as never;
      break;
    case "workload":
      data = await getWorkloadReport(em, ctx, input) as never;
      break;
    case "blockedItems":
      data = await getBlockedItemsReport(em, ctx, input) as never;
      break;
    case "staleIssues":
      data = await getStaleIssuesReport(em, ctx, input) as never;
      break;
    case "progressRollup":
      data = [await getProgressRollupReport(em, ctx, input) as never];
      break;
  }

  return service.exportCsv(input.reportType, data);
}
