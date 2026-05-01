/**
 * Zod schemas for the runs domain (agent execution runs).
 * Pillar 5 (Symphony + agent dispatch) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Run status — Pillar 5 adds streaming status transitions. */
export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

/** Minimal Run output schema — Pillar 5 extends with full orchestration fields. */
export const RunSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  status: RunStatusSchema,
  createdAt: z.date(),
});

/** Input for listing runs — Pillar 5 adds filters/pagination. */
export const ListRunsInputSchema = z.object({
  orgId: z.string().uuid().optional(),
});

export type Run = z.infer<typeof RunSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type ListRunsInput = z.infer<typeof ListRunsInputSchema>;
