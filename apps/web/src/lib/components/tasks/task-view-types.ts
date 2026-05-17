import type { BoardTask } from "$lib/product-queries";

export interface TaskViewRow extends BoardTask {
  created_at?: string;
  customFields?: Record<string, unknown> | null;
}

export type TaskSortDirection = "asc" | "desc";
export type TaskColumnKey =
  | "title"
  | "status"
  | "assignee"
  | "priority"
  | "sprint"
  | "labels"
  | "due_date"
  | "created_at"
  | string;

export interface TaskColumn {
  key: TaskColumnKey;
  label: string;
}
