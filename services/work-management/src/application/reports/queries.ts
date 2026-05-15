import type { EntityManager } from "typeorm";

import { MetricsCache } from "@work-management/infrastructure/database/entities/tasks/MetricsCache.ts";
import { Sprint } from "@work-management/infrastructure/database/entities/tasks/Sprint.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { WorkMetricsService } from "@work-management/application/work-metrics-service.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import { getProjectOrNull } from "@work-management/application/projects/queries.ts";
import { loadReports, type ReportsData } from "@work-management/application/report-dashboard.ts";
import type {
  AppContext,
  BurndownPoint,
  DateRange,
  ReportExportCsvInput,
  ReportScopeType,
  ReportSnapshotDto,
} from "@work-management/application/reports/types.ts";

export async function listReportSnapshots(
  em: EntityManager,
  _ctx: AppContext,
  input: { projectId: string },
): Promise<ReportSnapshotDto[]> {
  const rows = await em.find(MetricsCache, { where: { projectId: input.projectId } as never, order: { date: "ASC", id: "ASC" } });
  return rows.map((row) => serializeReportSnapshot(row, _ctx.orgId));
}

export async function getReportSnapshot(em: EntityManager, ctx: AppContext, id: string): Promise<ReportSnapshotDto> {
  const row = await em.findOne(MetricsCache, { where: { id } as never });
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
  const sprint = await em.findOne(Sprint, { where: {
    id: input.sprintId,
    org: { id: ctx.orgId },
    projectId: input.projectId,
  } as never });
  if (!sprint) return [];

  const tasks = await em.createQueryBuilder(Task, "task")
    .select(["points", "status"])
    .where({ org: { id: ctx.orgId }, sprint: input.sprintId, deletedAt: null } as never)
    .getRawMany<{ points: number | null; status: string | null }>();
  const totalPoints = tasks.reduce((sum: number, task: { points: number | null; status: string | null }) => sum + (task.points ?? 0), 0);
  if (totalPoints === 0) return [];

  const totalDays = daysBetween(sprint.startDate, sprint.endDate);
  const cached = await em.find(MetricsCache, { where: {
    projectId: input.projectId,
    sprint: input.sprintId,
  } as never, order: { date: "ASC" } });
  const actualMap = new Map(cached.map((row) => [dateStr(row.date), row.pointsRemaining]));
  const doneStatuses = new Set(["done", "completed", "closed"]);
  const donePoints = tasks.reduce((sum: number, task: { points: number | null; status: string | null }) => {
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

export async function loadProjectReportsPage(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string; sprintId?: string },
): Promise<{
  project: { id: string; name: string };
  reports: ReportsData;
  selectedSprintId: string | null;
  orgId: string;
}> {
  const project = await getProjectOrNull(em, ctx, input.projectId);
  if (!project) throw new AppNotFoundError("Project not found");
  const reports = await loadReports(em, project.id, input.sprintId);
  return {
    project: { id: project.id, name: project.name },
    reports,
    selectedSprintId: input.sprintId ?? null,
    orgId: ctx.orgId,
  };
}

export async function getBurndownReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return (await new WorkMetricsService(em).getBurndown(ctx.orgId, input.scopeType, input.scopeId, input.dateRange))
    .map(toRouterBurndownPoint);
}

export async function getBurnupReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getBurnup(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getVelocityReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; lastN: number },
) {
  return new WorkMetricsService(em).getVelocity(ctx.orgId, input.scopeType, input.scopeId, input.lastN);
}

export async function getCfdReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getCfd(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getCycleTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getCycleTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getLeadTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getLeadTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getThroughputReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getThroughput(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getWipOverTimeReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; dateRange: DateRange },
) {
  return new WorkMetricsService(em).getWipOverTime(ctx.orgId, input.scopeType, input.scopeId, input.dateRange);
}

export async function getWorkloadReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new WorkMetricsService(em).getWorkload(ctx.orgId, input.scopeType, input.scopeId);
}

export async function getBlockedItemsReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new WorkMetricsService(em).getBlockedItems(ctx.orgId, input.scopeType, input.scopeId);
}

export async function getStaleIssuesReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string; thresholdDays: number },
) {
  return new WorkMetricsService(em).getStaleIssues(ctx.orgId, input.scopeType, input.scopeId, input.thresholdDays);
}

export async function getProgressRollupReport(
  em: EntityManager,
  ctx: AppContext,
  input: { scopeType: ReportScopeType; scopeId?: string },
) {
  return new WorkMetricsService(em).getProgressRollup(ctx.orgId, input.scopeType, input.scopeId);
}

export async function exportReportCsv(
  em: EntityManager,
  ctx: AppContext,
  input: ReportExportCsvInput,
): Promise<string> {
  const service = new WorkMetricsService(em);
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
