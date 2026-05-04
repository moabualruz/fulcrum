import { Event } from "../db/entities/core/Event.ts";
import { Org } from "../db/entities/auth/Org.ts";
import type { EventRepository } from "../db/repositories/core/EventRepository.ts";
import { ROUTING_EVENT_VERB, RoutingEventPayloadSchema } from "./routing-event-payload.ts";
import type { RoutingDecision } from "./types.ts";

interface RoutingTelemetryConfig {
  eventRepository?: EventRepository | null;
}

let eventRepository: EventRepository | null = null;

export function configureRoutingTelemetry(config: RoutingTelemetryConfig): void {
  eventRepository = config.eventRepository ?? null;
}

export async function recordRoutingEvent(
  decision: RoutingDecision,
  taskId: string,
  orgId: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  if (!eventRepository) {
    throw new Error("routing telemetry event repository is not configured");
  }

  const payload = RoutingEventPayloadSchema.parse({
    rule_id: decision.ruleId,
    source: decision.source,
    agent: decision.agent,
    confidence: decision.confidence,
  });

  const em = eventRepository.getEntityManager();
  const event = eventRepository.create({
    org: em.getReference(Org, orgId),
    verb: ROUTING_EVENT_VERB,
    subjectKind: "task",
    subjectId: taskId,
    payload,
  } as never);

  em.persist(event as Event);
  await em.flush();
}
