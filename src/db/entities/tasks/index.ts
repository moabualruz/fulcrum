/**
 * Tasks domain entity barrel (Pillar 6 stub).
 */

export { Task } from "./Task.ts";
export { TaskStatus } from "./TaskStatus.ts";
export { Sprint, SprintStatus } from "./Sprint.ts";
export {
  SavedView,
  SAVED_VIEW_SCOPES,
  SAVED_VIEW_TYPES,
  type SavedViewScope,
  type SavedViewType,
} from "./SavedView.ts";
export {
  TASK_STATUS_CATEGORIES,
  SPRINT_STATUSES,
  TaskStatusCategorySchema,
  SprintStatusSchema,
  CreateSprintInput,
  DependenciesSchema,
  ExternalTaskIdSchema,
  type TaskStatusCategory,
  type SprintStatusValue,
  type CreateSprintInput as CreateSprintInputType,
  type TaskDependencies,
  type ExternalTaskId,
} from "./schemas.ts";
