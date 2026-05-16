/**
 * Tasks domain entity barrel (Pillar 6 stub).
 */

export { Task } from "./Task.ts";
export { TaskStatus } from "./TaskStatus.ts";
export { Sprint, SprintStatus } from "./Sprint.ts";
export { MetricsCache } from "./MetricsCache.ts";
export {
  CustomFieldDef,
  CUSTOM_FIELD_TYPES,
  CustomFieldConfigSchema,
  DEFAULT_CUSTOM_FIELDS,
  type CustomFieldType,
  type CustomFieldConfig,
} from "./CustomFieldDef.ts";
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
export { TaskComment } from "./TaskComment.ts";
export { TaskWatcher } from "./TaskWatcher.ts";
export { CommentReaction } from "./CommentReaction.ts";
export { TaskRelationship } from "./TaskRelationship.ts";
export { ProjectAutomation } from "./ProjectAutomation.ts";
export { FieldDependencyRule } from "./FieldDependencyRule.ts";
export { YjsSnapshot } from "./YjsSnapshot.ts";
export { TaskTemplate } from "./TaskTemplate.ts";
export { TaskRecurrenceRule } from "./TaskRecurrenceRule.ts";
export { TimeEntry } from "./TimeEntry.ts";
