export interface TuiTask {
  id: string;
  title: string;
  status: string;
  assignee?: string | null;
  labels?: string[] | null;
  dueDate?: string | Date | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export const TASK_STATUSES = ["todo", "in-progress", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}
