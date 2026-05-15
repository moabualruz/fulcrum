/**
 * Shared Zod schemas for public API — synced with tRPC schemas.
 */
import { z } from "zod/v4";

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

// ── Notification schemas ────────────────────────────────────────────

export const NotificationRow = z.object({
  id: z.string(),
  org_id: z.string(),
  user_id: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  read: z.boolean(),
  created_at: z.string(),
});

export const NotificationListResponse = z.object({
  data: z.array(NotificationRow),
});

export const NotificationRuleRow = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  event_pattern: z.record(z.string(), z.unknown()),
  channels: z.array(z.string()),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CreateRuleBody = z.object({
  name: z.string().min(1),
  event_pattern: z.record(z.string(), z.unknown()),
  channels: z.array(z.string()),
  enabled: z.boolean().optional(),
});

export const UpdateRuleBody = z.object({
  name: z.string().min(1).optional(),
  event_pattern: z.record(z.string(), z.unknown()).optional(),
  channels: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const WebhookConfigBody = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
});

export const WebhookConfigResponse = z.object({
  url: z.string(),
  secret: z.string(),
});

// ── Audit schemas ──────────────────────────────────────────────────

export const AuditEventRow = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string().nullable(),
  actor: z.string(),
  subject_kind: z.string(),
  subject_id: z.string(),
  verb: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

export const AuditQueryParams = z.object({
  kind: z.string().optional(),
  verb: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const AuditListResponse = z.object({
  data: z.array(AuditEventRow),
  total: z.number().int(),
});

// ── Error schema ─────────────────────────────────────────────────────

export const ErrorResponse = z.object({
  error: z.string(),
});
