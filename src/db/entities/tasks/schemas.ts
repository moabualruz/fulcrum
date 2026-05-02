import { z } from "zod";

export const TASK_STATUS_CATEGORIES = [
  "unstarted",
  "started",
  "completed",
  "cancelled",
] as const;

export const TaskStatusCategorySchema = z.enum(TASK_STATUS_CATEGORIES);
export type TaskStatusCategory = z.infer<typeof TaskStatusCategorySchema>;

export const DependenciesSchema = z.object({
  blocks: z.array(z.string().uuid()),
  blocked_by: z.array(z.string().uuid()),
}).strict();
export type TaskDependencies = z.infer<typeof DependenciesSchema>;

export const ExternalTaskIdSchema = z.string().regex(
  /^(jira:[A-Za-z0-9][A-Za-z0-9._-]*|linear:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|github:\d+)$/,
);
export type ExternalTaskId = z.infer<typeof ExternalTaskIdSchema>;
