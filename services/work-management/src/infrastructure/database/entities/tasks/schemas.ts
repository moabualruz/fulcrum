import { z } from "zod";

const UuidLikeSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
);

export const TASK_STATUS_CATEGORIES = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
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

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "user",
  "url",
  "boolean",
  "checkbox",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const TASK_TYPES = ["epic", "task", "subtask", "bug"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const METHODOLOGIES = ["scrum", "kanban", "none"] as const;
export type Methodology = (typeof METHODOLOGIES)[number];

/** Set by migration — false if pg_trgm extension unavailable on this DB */
export const HAS_TRGM = process.env.FULCRUM_HAS_TRGM !== "false";

export const SPRINT_STATUSES = ["planned", "active", "completed"] as const;
export const SprintStatusSchema = z.enum(SPRINT_STATUSES);
export type SprintStatusValue = z.infer<typeof SprintStatusSchema>;

export const CreateSprintInput = z.object({
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema,
  name: z.string().trim().min(1),
  goal: z.string().trim().min(1).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: SprintStatusSchema.default("planned"),
  capacityPoints: z.number().int().nonnegative().optional(),
}).strict().refine((input) => input.startDate < input.endDate, {
  message: "startDate must be before endDate",
  path: ["endDate"],
});
export type CreateSprintInput = z.infer<typeof CreateSprintInput>;
