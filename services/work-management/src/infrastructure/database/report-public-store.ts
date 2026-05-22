import { DataSource, In } from "typeorm";

import {
  type WorkManagementCycle,
  type WorkManagementCycleTask,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  type FulcrumProject,
  type FulcrumTask,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import type { ProjectReportsPage } from "@work-management/interface/project-reports.ts";

interface ReportPublicInput {
  orgId: string;
  projectId: string;
}

interface BurndownInput extends ReportPublicInput {
  sprintId?: string;
}

export interface ReportPublicResponse {
  data: Array<Record<string, unknown>>;
}

export class ReportPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async projectPage(input: BurndownInput): Promise<ProjectReportsPage> {
    const reports = await import("@work-management/interface/project-reports.ts");
    return await reports.loadProjectReportsPage(
      this.dataSource.manager,
      { orgId: input.orgId, userId: null, projectId: input.projectId },
      { projectId: input.projectId, sprintId: input.sprintId },
    );
  }

  async burndown(input: BurndownInput): Promise<ReportPublicResponse> {
    const project = await this.projectForOrg(input);
    if (!project) return { data: [] };

    const cycle = await this.resolveCycle(project.id, input.sprintId);
    if (!cycle) return { data: [] };

    const tasks = await this.tasksForCycle(project.id, cycle.id);
    if (tasks.length === 0) return { data: [] };

    const total = tasks.length;
    const completed = tasks.filter((task) => isDoneStatus(task.status)).length;
    const remainingAfterCompletion = total - completed;
    const dates = dateRange(cycle.startsAt, cycle.endsAt);
    const finalIndex = Math.max(1, dates.length - 1);

    return {
      data: dates.map((date, index) => {
        const ideal = index === dates.length - 1
          ? 0
          : Math.round(Math.max(0, total - (total / finalIndex) * index) * 100) / 100;
        return {
          date: date.toISOString().slice(0, 10),
          remaining: index === 0 ? total : remainingAfterCompletion,
          ideal,
          sprintId: cycle.id,
          traceId: cycle.traceId,
        };
      }),
    };
  }

  async velocity(input: ReportPublicInput): Promise<ReportPublicResponse> {
    const project = await this.projectForOrg(input);
    if (!project) return { data: [] };

    const cycles = await this.cycleRepository().find({
      where: { projectId: project.id },
      order: { startsAt: "ASC", createdAt: "ASC", id: "ASC" },
    });
    const data: Array<Record<string, unknown>> = [];

    for (const cycle of cycles) {
      const tasks = await this.tasksForCycle(project.id, cycle.id);
      const completedTasks = tasks.filter((task) => isDoneStatus(task.status)).length;
      data.push({
        sprintId: cycle.id,
        sprintName: cycle.name,
        points: completedTasks,
        completedTasks,
        totalTasks: tasks.length,
        traceId: cycle.traceId,
      });
    }

    return { data };
  }

  private async projectForOrg(input: ReportPublicInput): Promise<FulcrumProject | null> {
    return await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: input.projectId,
      workspaceId: input.orgId,
    });
  }

  private async resolveCycle(projectId: string, sprintId: string | undefined): Promise<WorkManagementCycle | null> {
    if (sprintId) {
      return await this.cycleRepository().findOneBy({ id: sprintId, projectId });
    }

    return await this.cycleRepository().findOne({
      where: { projectId },
      order: { startsAt: "ASC", createdAt: "ASC", id: "ASC" },
    });
  }

  private async tasksForCycle(projectId: string, cycleId: string): Promise<FulcrumTask[]> {
    const assignments = await this.dataSource.getRepository(WorkManagementCycleTaskEntity).find({
      where: { projectId, cycleId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    if (assignments.length === 0) return [];

    return await this.dataSource.getRepository(FulcrumTaskEntity).find({
      where: {
        projectId,
        id: In(assignments.map((assignment: WorkManagementCycleTask) => assignment.taskId)),
      },
      order: { createdAt: "ASC", id: "ASC" },
    });
  }

  private cycleRepository() {
    return this.dataSource.getRepository(WorkManagementCycleEntity);
  }
}

function isDoneStatus(status: string): boolean {
  return ["done", "completed", "closed"].includes(status.toLowerCase());
}

function dateRange(startsAt: Date | null, endsAt: Date | null): Date[] {
  const start = startsAt ?? new Date();
  const end = endsAt && endsAt.getTime() >= start.getTime() ? endsAt : start;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  return Array.from({ length: days + 1 }, (_, index) => new Date(start.getTime() + index * 86_400_000));
}
