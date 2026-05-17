/**
 * Zod schemas for the routing domain (task-to-agent routing decisions).
 * Pillar 5 (Symphony + agent dispatch) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Routing policy — how the router selects an agent for a given task. */
export const RoutingPolicySchema = z.enum([
  "round-robin",
  "least-loaded",
  "capability-match",
  "cost-optimised",
  "manual",
]);

/** Routing decision outcome. */
export const RoutingOutcomeSchema = z.enum(["routed", "queued", "rejected", "fallback"]);

/** Input for creating a routing rule. */
export const RoutingInput = z.object({
  orgId: z.string().uuid().describe("Organisation that owns this routing rule."),
  name: z.string().min(1).describe("Human-readable name for the routing rule."),
  policy: RoutingPolicySchema.describe("Algorithm used to select a target agent."),
  targetAgentIds: z.array(z.string()).describe("Candidate agent identifiers the router may select from."),
  description: z.string().describe("What this routing rule is for."),
});

/** Minimal Routing output schema. */
export const RoutingOutput = z.object({
  id: z.string().uuid().describe("Unique routing record identifier."),
  orgId: z.string().uuid().describe("Organisation that owns this routing rule."),
  name: z.string().describe("Human-readable name for the routing rule."),
  policy: RoutingPolicySchema.describe("Algorithm used to select a target agent."),
  outcome: RoutingOutcomeSchema.describe("Result of the most recent routing decision."),
  selectedAgentId: z.string().nullable().describe("Agent selected by the most recent routing decision, or null."),
  createdAt: z.date().describe("Timestamp when the routing rule was created."),
});

/** Input for listing routing rules. */
export const ListRoutingInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
  policy: RoutingPolicySchema.optional().describe("Filter by routing policy."),
});

export type RoutingInputType = z.infer<typeof RoutingInput>;
export type RoutingOutputType = z.infer<typeof RoutingOutput>;
export type RoutingPolicy = z.infer<typeof RoutingPolicySchema>;
export type RoutingOutcome = z.infer<typeof RoutingOutcomeSchema>;
export type ListRoutingInputType = z.infer<typeof ListRoutingInput>;
