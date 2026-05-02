/**
 * Tasks domain entity barrel (Pillar 6 stub).
 */

export { Task } from "./Task.ts";
export { TaskStatus } from "./TaskStatus.ts";
export {
  TASK_STATUS_CATEGORIES,
  TaskStatusCategorySchema,
  DependenciesSchema,
  ExternalTaskIdSchema,
  type TaskStatusCategory,
  type TaskDependencies,
  type ExternalTaskId,
} from "./schemas.ts";
