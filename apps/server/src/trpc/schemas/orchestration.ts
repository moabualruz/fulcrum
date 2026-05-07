/**
 * Zod schemas for the orchestration domain (agent dispatch, wave management).
 * Pillar 5 (Symphony + agent dispatch) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Orchestration strategy — how tasks are dispatched to agents. */
export const OrchestrationStrategySchema = z.enum([
  "sequential",
  "parallel",
  "wave",
  "fan-out",
  "pipeline",
]);

/** Orchestration status. */
export const OrchestrationStatusSchema = z.enum([
  "pending",
  "dispatching",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

/** Input for creating an orchestration plan. */
export const OrchestrationInput = z.object({
  orgId: z.string().uuid().describe("Organisation that owns this orchestration."),
  name: z.string().min(1).describe("Human-readable name for the orchestration plan."),
  strategy: OrchestrationStrategySchema.describe("How tasks are dispatched and coordinated across agents."),
  agentIds: z.array(z.string()).describe("Agent identifiers participating in this orchestration."),
  description: z.string().describe("What this orchestration accomplishes."),
});

/** Minimal Orchestration output schema. */
export const OrchestrationOutput = z.object({
  id: z.string().uuid().describe("Unique orchestration record identifier."),
  orgId: z.string().uuid().describe("Organisation that owns this orchestration."),
  name: z.string().describe("Human-readable name for the orchestration plan."),
  strategy: OrchestrationStrategySchema.describe("How tasks are dispatched and coordinated."),
  status: OrchestrationStatusSchema.describe("Current execution status of the orchestration."),
  createdAt: z.date().describe("Timestamp when the orchestration was created."),
});

/** Input for listing orchestrations. */
export const ListOrchestrationInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
  status: OrchestrationStatusSchema.optional().describe("Filter by execution status."),
  strategy: OrchestrationStrategySchema.optional().describe("Filter by orchestration strategy."),
});

export type OrchestrationInputType = z.infer<typeof OrchestrationInput>;
export type OrchestrationOutputType = z.infer<typeof OrchestrationOutput>;
export type OrchestrationStrategy = z.infer<typeof OrchestrationStrategySchema>;
export type OrchestrationStatus = z.infer<typeof OrchestrationStatusSchema>;
export type ListOrchestrationInputType = z.infer<typeof ListOrchestrationInput>;
