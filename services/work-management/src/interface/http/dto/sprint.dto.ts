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
