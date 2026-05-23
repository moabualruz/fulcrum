import type { DataSource } from "typeorm";

import type {
  ProjectTimelineSprint,
  ProjectTimelineTask,
  TaskRelationshipDto,
} from "@work-management/application/projects/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export interface ProjectCalendarReadModel {
  projectId: string;
  project: { id: string };
  tasks: ProjectTimelineTask[];
  activeSprint: ProjectTimelineSprint | null;
}

export interface ProjectGanttReadModel {
  projectId: string;
  project: { id: string };
  tasks: ProjectTimelineTask[];
  relationships: TaskRelationshipDto[];
}

/**
 * Persistence facade for project-timeline read-models and reschedule.
 *
 * The web calendar/gantt routes used to call the `@work-management` timeline
 * queries directly with an in-process EntityManager. With that DB seam retired,
 * this store is the single place that opens the `DataSource` and delegates to
 * the same application queries/commands — keeping the timeline SQL in one home
 * and the web routes a pure invocation layer over the public API.
 */
export class ProjectTimelineStore {
  constructor(private readonly dataSource: DataSource) {}

  async loadCalendar(input: { orgId: string; id: string }): Promise<ProjectCalendarReadModel> {
    const { loadProjectCalendar } = await import("@work-management/application/projects/queries.ts");
    return await loadProjectCalendar(this.dataSource.manager, this.context(input));
  }

  async loadGantt(input: { orgId: string; id: string }): Promise<ProjectGanttReadModel> {
    const { loadProjectGantt } = await import("@work-management/application/projects/queries.ts");
    return await loadProjectGantt(this.dataSource.manager, this.context(input));
  }

  async reschedule(input: {
    orgId: string;
    id: string;
    taskId: string;
    startDate?: string | null;
    dueDate?: string | null;
  }): Promise<{ ok: true }> {
    const { rescheduleProjectTask } = await import("@work-management/application/projects/commands.ts");
    return await rescheduleProjectTask(this.dataSource.manager, this.context(input), {
      taskId: input.taskId,
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    });
  }

  /** The timeline queries/commands scope by `projectId` on the context, not a param. */
  private context(input: { orgId: string; id: string }): AppContext {
    return { orgId: input.orgId, userId: null, projectId: input.id };
  }
}
