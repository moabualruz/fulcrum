import { z } from "zod";

import { DependenciesSchema } from "@platform-core/infrastructure/application-database/entities/tasks/schemas.ts";
import type { TipTapJson } from "@platform-core/infrastructure/application-database/tasks-rich-text.ts";

export const TipTapContentSchema: z.ZodType<TipTapJson> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    content: z.array(TipTapContentSchema).optional(),
  }).catchall(z.unknown()),
);

export const TaskDtoSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  projectId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  descriptionText: z.string(),
  tiptapContent: TipTapContentSchema,
  status: z.string().nullable(),
  priority: z.number().int().nullable(),
  points: z.number().int().nullable(),
  assigneeId: z.string().nullable(),
  labels: z.array(z.string()),
  parentId: z.uuid().nullable(),
  dependencies: DependenciesSchema,
  taskType: z.string(),
  cycleId: z.string().nullable(),
  moduleId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const ListTasksInputSchema = z.object({
  includeDeleted: z.boolean().optional(),
}).optional();

export const TaskIdInputSchema = z.object({ id: z.uuid() });

export const TaskIdsInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).transform((ids) => [...new Set(ids)].sort()),
});

export const TaskRelationIdInputSchema = z.object({ taskId: z.uuid() });

export const SetParentInputSchema = TaskRelationIdInputSchema.extend({
  parentId: z.uuid().nullable(),
});

export const SetDependenciesInputSchema = TaskRelationIdInputSchema.extend({
  dependencies: DependenciesSchema,
});

export const CreateTaskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  taskType: z.string().trim().min(1).optional(),
  cycleId: z.string().trim().min(1).nullable().optional(),
  moduleId: z.string().trim().min(1).nullable().optional(),
});

export const UpdateTaskInputSchema = TaskIdInputSchema.extend({
  expectedStatus: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  taskType: z.string().trim().min(1).optional(),
  cycleId: z.string().trim().min(1).nullable().optional(),
  moduleId: z.string().trim().min(1).nullable().optional(),
});

export const BulkTaskPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  descriptionText: z.string().optional(),
  tiptapContent: TipTapContentSchema.optional(),
  status: z.string().trim().min(1).nullable().optional(),
  priority: z.number().int().nullable().optional(),
  points: z.number().int().nonnegative().nullable().optional(),
  assignee: z.string().trim().min(1).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  label: z.string().trim().min(1).nullable().optional(),
  sprintId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: "Bulk update patch must include at least one field.",
});

export const BulkUpdateTasksInputSchema = TaskIdsInputSchema.extend({
  patch: BulkTaskPatchSchema,
});

export const BulkUpdateOutputSchema = z.object({ updated: z.number().int().nonnegative() });
export const BulkDeleteOutputSchema = z.object({ deleted: z.number().int().nonnegative() });
