export const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type PublicTaskStatus = (typeof TASK_STATUSES)[number];

export class TaskListQueryDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  include_deleted?: boolean | string;
}

export class TaskRequestContextDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
}

export class TaskManualWorkbenchQueryDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  traceId?: string;
  viewMode?: "board" | "list" | "table";
  project_capabilities_estimate_enabled?: boolean | string;
  projectCapabilitiesEstimateEnabled?: boolean | string;
  statuses?: string;
  stateGroups?: string;
  labels?: string;
  assigneeIds?: string;
  cycleIds?: string;
  moduleIds?: string;
  taskTypes?: string;
  priorities?: string;
  search?: string;
}

export class TaskIdParamsDto {
  id!: string;
}

export class TaskCreateBodyDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  title!: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: unknown;
  status?: PublicTaskStatus;
  priority?: number;
  points?: number;
  assigneeId?: string;
  traceId?: string;
}

export class TaskPatchBodyDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  title?: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: unknown;
  status?: PublicTaskStatus;
  priority?: number;
  points?: number;
  assigneeId?: string;
  sprintId?: string | null;
  sprint_id?: string | null;
}

export class TaskDependenciesBodyDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  blocks?: string[];
  blocked_by?: string[];
}

export class TaskParentBodyDto {
  orgId!: string;
  userId!: string;
  project_id?: string | null;
  projectId?: string | null;
  parentId?: string | null;
}

export class TaskCsvExportQueryDto {
  entity!: "tasks";
  projectId!: string;
}

export class TaskCsvImportBodyDto {
  entity!: "tasks";
  projectId!: string;
  csv!: string;
  columnMap?: Record<string, string>;
}
