import type { EntityManager } from "typeorm";

import type { AppContext } from "@work-management/domain/work-item.ts";
import type { ReportsData } from "@work-management/application/report-dashboard.ts";

export interface ProjectReportsPage {
  project: { id: string; name: string };
  reports: ReportsData;
  selectedSprintId: string | null;
  orgId: string;
}

export async function loadProjectReportsPage(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string; sprintId?: string },
): Promise<ProjectReportsPage> {
  const service = await import("@work-management/application/reports/queries.ts");
  return service.loadProjectReportsPage(em, ctx, input);
}
