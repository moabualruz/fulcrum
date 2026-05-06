import type { EntityManager } from "@mikro-orm/postgresql";

import { MetricsCache } from "../../db/entities/tasks/MetricsCache.ts";
import { AppNotFoundError } from "../errors.ts";
import type { AppContext, ReportSnapshotDto } from "./types.ts";

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
