import { z } from "zod";

import { RoutingRuleSource } from "../db/entities/router/RoutingRule.ts";

export const ROUTING_EVENT_VERB = "routed" as const;

export const RoutingEventPayloadSchema = z.object({
  rule_id: z.string().uuid(),
  source: z.enum([
    RoutingRuleSource.Manual,
    RoutingRuleSource.Learned,
    RoutingRuleSource.Imported,
  ]),
  agent: z.string().min(1),
  confidence: z.number().min(0).max(1),
}).strict();

export type RoutingEventPayload = z.infer<typeof RoutingEventPayloadSchema>;
