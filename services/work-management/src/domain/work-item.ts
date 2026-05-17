import type { TaskDependencies } from "@work-management/infrastructure/database/entities/tasks/schemas.ts";
import type { TipTapJson } from "@platform-core/infrastructure/application-database/tasks-rich-text.ts";

export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface TaskDto {
  id: string;
  orgId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  descriptionText: string;
  tiptapContent: TipTapJson;
  status: string | null;
  priority: number | null;
  points: number | null;
  assigneeId: string | null;
  labels: string[];
  parentId: string | null;
  dependencies: TaskDependencies;
  taskType: string;
  cycleId: string | null;
  moduleId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: TipTapJson;
  status?: string | null;
  priority?: number | null;
  points?: number | null;
  assigneeId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  taskType?: string;
  cycleId?: string | null;
  moduleId?: string | null;
}

export interface UpdateTaskInput {
  expectedStatus?: string | null;
  title?: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: TipTapJson;
  status?: string | null;
  priority?: number | null;
  points?: number | null;
  assigneeId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  taskType?: string;
  cycleId?: string | null;
  moduleId?: string | null;
}

export interface BulkTaskPatch extends UpdateTaskInput {
  assignee?: string | null;
  label?: string | null;
  sprintId?: string | null;
}

export interface ListTasksInput {
  includeDeleted?: boolean;
}
