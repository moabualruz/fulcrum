import { z } from "zod";

export const SetupStatusSchema = z.enum([
  "previewed",
  "applied",
  "needs_repair",
  "uninstall_previewed",
  "uninstalled"
]);

export const TaskStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "blocked",
  "review",
  "failed",
  "completed",
  "archived"
]);

export const RunStatusSchema = z.enum([
  "created",
  "starting",
  "running",
  "waiting_for_agent",
  "waiting_for_operator",
  "blocked",
  "cancel_requested",
  "cancelled",
  "failed",
  "succeeded",
  "review_required",
  "completed"
]);

export const terminalRunStatuses = ["cancelled", "failed", "completed"] as const;

export const WorktreeStatusSchema = z.enum([
  "requested",
  "allocated",
  "active",
  "review_ready",
  "merge_ready",
  "merged",
  "blocked",
  "cleanup_requested",
  "cleanup_blocked",
  "cleaned"
]);

export const GateStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "timeout",
  "skipped"
]);
export const MemoryStatusSchema = z.enum([
  "draft",
  "active",
  "superseded",
  "stale",
  "archived",
  "deleted"
]);
export const SyncStatusSchema = z.enum([
  "never_synced",
  "synced",
  "local_newer",
  "remote_newer",
  "conflict",
  "failed",
  "disabled"
]);
export const CapabilityStateSchema = z.enum([
  "managed",
  "detected",
  "guided",
  "optional",
  "blocked",
  "degraded",
  "disabled",
  "unknown"
]);
export const PolicyDecisionStatusSchema = z.enum([
  "allowed",
  "denied",
  "approval_required",
  "approved"
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
