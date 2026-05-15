import type { EntityManager } from "typeorm";

import { MetricsCache } from "@work-management/infrastructure/database/entities/tasks/MetricsCache.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { serializeReportSnapshot } from "@work-management/application/reports/queries.ts";
import type { AppContext, CreateReportSnapshotInput, ReportSnapshotDto } from "@work-management/application/reports/types.ts";

export async function createReportSnapshot(
  em: EntityManager,
  ctx: AppContext,
  input: CreateReportSnapshotInput,
): Promise<ReportSnapshotDto> {
  if (!input.projectId) throw new AppValidationError("Report projectId is required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const row = txEm.create(MetricsCache, {
      projectId: input.projectId,
      date: input.date,
      scopeType: input.scopeType,
      completedCount: input.completedCount ?? 0,
      pointsCompleted: input.pointsCompleted ?? 0,
    });
    await txEm.save(row);
    return serializeReportSnapshot(row, ctx.orgId);
  });
}
