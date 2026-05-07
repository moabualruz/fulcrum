/**
 * Re-export from canonical service layer.
 * Web consumers use $lib/server/tasks — this file preserves that alias.
 * Actual logic lives in src/services/tasks.ts.
 */
export {
  type TaskStatus,
  TASK_STATUSES,
  type CreateTaskInput,
  type UpdateTaskInput,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  moveTaskStatusAction,
} from "@/services/tasks.ts";
