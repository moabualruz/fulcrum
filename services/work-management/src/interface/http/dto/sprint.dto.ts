export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

export class SprintListQueryDto {
  orgId!: string;
  project_id?: string;
  projectId?: string;
}

export class SprintRequestContextDto {
  orgId!: string;
}

export class SprintIdParamsDto {
  id!: string;
}

export class SprintCreateBodyDto {
  orgId!: string;
  projectId?: string;
  name!: string;
  status?: SprintStatus;
}

export class SprintPatchBodyDto {
  orgId!: string;
  name?: string;
  status?: SprintStatus;
}

export class SprintCloseBodyDto {
  orgId!: string;
  unfinishedDisposition?: "backlog";
}

export class SprintTaskParamsDto {
  id!: string;
  taskId!: string;
}

export class SprintTaskBodyDto {
  orgId!: string;
  taskId!: string;
}

export class SprintListResponseDto {
  data!: unknown[];
}

/**
 * Project-scoped sprint DTOs back the web `/projects/[id]/sprints` board, which
 * reads the `sprints` table (goal / capacity / start-end dates) rather than the
 * cycle model the DTOs above describe.
 */
export class ProjectSprintBoardQueryDto {
  orgId!: string;
  projectId!: string;
}

export class ProjectSprintCreateBodyDto {
  orgId!: string;
  projectId!: string;
  name!: string;
  goal?: string | null;
  capacity?: number | null;
}

export class ProjectSprintDetailQueryDto {
  orgId!: string;
  projectId!: string;
}

export class ProjectSprintGoalBodyDto {
  orgId!: string;
  goal!: string;
}

export class ProjectSprintTaskCreateBodyDto {
  orgId!: string;
  projectId!: string;
  title!: string;
  status?: string | null;
}

export class ProjectSprintTaskPatchBodyDto {
  orgId!: string;
  projectId!: string;
  status?: string | null;
}

export class ProjectSprintTaskParamsDto {
  taskId!: string;
}
