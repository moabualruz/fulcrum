/**
 * Zod schemas for the audit domain (audit log events).
 * Pillar 11 (audit + compliance) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Audit event action — what happened. */
export const AuditActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "read",
  "login",
  "logout",
  "invite",
  "revoke",
  "execute",
]);

/** Input for querying audit log events. */
export const AuditInput = z.object({
  orgId: z.string().uuid().describe("Organisation whose audit log to query."),
  action: AuditActionSchema.optional().describe("Filter by event action type."),
  actorId: z.string().uuid().optional().describe("Filter by the user who performed the action."),
  resourceType: z.string().optional().describe("Filter by resource type, e.g. task, run, webhook."),
  since: z.date().optional().describe("Return events after this timestamp."),
  until: z.date().optional().describe("Return events before this timestamp."),
});

/** Minimal Audit output schema — Pillar 11 extends with full field set. */
export const AuditOutput = z.object({
  id: z.string().uuid().describe("Unique audit event identifier."),
  orgId: z.string().uuid().describe("Organisation the event belongs to."),
  actorId: z.string().uuid().describe("User who performed the action."),
  action: AuditActionSchema.describe("Type of action that was performed."),
  resourceType: z.string().describe("Type of resource that was acted upon, e.g. task."),
  resourceId: z.string().describe("Identifier of the specific resource that was acted upon."),
  metadata: z.record(z.string(), z.string()).describe("Arbitrary key-value pairs with additional event context."),
  createdAt: z.date().describe("Timestamp when the audit event was recorded."),
});

/** Input for listing audit events (alias with clearer semantics). */
export const ListAuditInput = AuditInput;

export type AuditInputType = z.infer<typeof AuditInput>;
export type AuditOutputType = z.infer<typeof AuditOutput>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type ListAuditInputType = z.infer<typeof ListAuditInput>;
