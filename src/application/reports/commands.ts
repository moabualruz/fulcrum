import type { EntityManager } from "@mikro-orm/postgresql";

import { MetricsCache } from "../../db/entities/tasks/MetricsCache.ts";
import { AppValidationError } from "../errors.ts";
import { serializeReportSnapshot } from "./queries.ts";
import type { AppContext, CreateReportSnapshotInput, ReportSnapshotDto } from "./types.ts";

export async function createReportSnapshot(
  em: EntityManager,
  ctx: AppContext,
  input: CreateReportSnapshotInput,
): Promise<ReportSnapshotDto> {
  if (!input.projectId) throw new AppValidationError("Report projectId is required.");
  return await em.transactional(async (txEm) => {
    const row = txEm.create(MetricsCache, {
      projectId: input.projectId,
      date: input.date,
      scopeType: input.scopeType,
      completedCount: input.completedCount ?? 0,
      pointsCompleted: input.pointsCompleted ?? 0,
    });
    txEm.persist(row);
    await txEm.flush();
    return serializeReportSnapshot(row, ctx.orgId);
  });
}
