/**
 * Zod schemas for the sprints domain.
 * Pillar 3 (tasks + kanban) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Sprint status — Pillar 3 extends with velocity tracking. */
export const SprintStatusSchema = z.enum(["planning", "active", "completed", "cancelled"]);

/** Minimal Sprint output schema — Pillar 3 extends with full field set. */
export const SprintSchema = z.object({
  id: z.string().uuid().describe("Unique sprint identifier."),
  orgId: z.string().uuid().describe("Organisation the sprint belongs to."),
  name: z.string().describe("Human-readable sprint name."),
  status: SprintStatusSchema.describe("Current lifecycle status of the sprint."),
  createdAt: z.date().describe("Timestamp when the sprint was created."),
});

/** Input for listing sprints — Pillar 3 adds filters/pagination. */
export const ListSprintsInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
});

export type Sprint = z.infer<typeof SprintSchema>;
export type SprintStatus = z.infer<typeof SprintStatusSchema>;
export type ListSprintsInput = z.infer<typeof ListSprintsInputSchema>;
