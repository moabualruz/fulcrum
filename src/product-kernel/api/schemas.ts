/**
 * Shared Zod schemas for public API — synced with tRPC schemas.
 */
import { z } from "@hono/zod-openapi";

// ── Task schemas ─────────────────────────────────────────────────────

export const TaskStatus = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);

export const TaskRow = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatus,
  priority: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CreateTaskBody = z.object({
  project_id: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: TaskStatus.optional(),
  priority: z.number().int().optional(),
});

export const UpdateTaskBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TaskStatus.optional(),
  priority: z.number().int().optional(),
});

export const TaskListQuery = z.object({
  project_id: z.string().optional(),
  status: TaskStatus.optional(),
  sprint_id: z.string().optional(),
  assignee_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const TaskListResponse = z.object({
  data: z.array(TaskRow),
  cursor: z.string().nullable(),
});

// ── Sprint schemas ───────────────────────────────────────────────────

export const SprintStatus = z.enum(["planning", "active", "completed", "cancelled"]);

export const SprintRow = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  goal: z.string().nullable(),
  status: SprintStatus,
  capacity_points: z.number().int(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CreateSprintBody = z.object({
  project_id: z.string(),
  name: z.string().min(1),
  goal: z.string().nullable().optional(),
  status: SprintStatus.optional(),
  capacity_points: z.number().int().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export const UpdateSprintBody = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().nullable().optional(),
  status: SprintStatus.optional(),
  capacity_points: z.number().int().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

// ── Report schemas ───────────────────────────────────────────────────

export const BurndownQuery = z.object({
  project_id: z.string(),
  sprint_id: z.string(),
});

export const BurndownRow = z.object({
  date: z.string(),
  points_remaining: z.number(),
  ideal: z.number(),
});

export const VelocityQuery = z.object({
  project_id: z.string(),
});

export const VelocityRow = z.object({
  sprint_name: z.string(),
  committed_points: z.number(),
  completed_points: z.number(),
});

// ── Error schema ─────────────────────────────────────────────────────

export const ErrorResponse = z.object({
  error: z.string(),
});
