import { z } from "zod";

export const ROUTING_EVENT_VERB = "routed" as const;

export const RoutingEventPayloadSchema = z.object({
  rule_id: z.string().uuid().nullable(),
  source: z.enum(["explicit", "rule", "learned", "llm-fallback", "manual"]),
  agent: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
}).strict();

export type RoutingEventPayload = z.infer<typeof RoutingEventPayloadSchema>;
