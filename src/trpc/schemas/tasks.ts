/**
 * Zod schemas for the tasks domain.
 * Pillar 3 (tasks + kanban) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Task status — Pillar 3 extends with board column mappings. */
export const TaskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
]);

/** Minimal Task output schema — Pillar 3 extends with full field set. */
export const TaskSchema = z.object({
  id: z.string().uuid().describe("Unique task identifier."),
  orgId: z.string().uuid().describe("Organisation the task belongs to."),
  title: z.string().describe("Short human-readable task title."),
  status: TaskStatusSchema.describe("Current workflow status of the task."),
  createdAt: z.date().describe("Timestamp when the task was created."),
});

/** Input for listing tasks — Pillar 3 adds filters/pagination. */
export const ListTasksInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;
