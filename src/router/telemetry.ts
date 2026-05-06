import type { EventRepository } from "../db/repositories/core/EventRepository.ts";
import {
  routingApplication,
  type RoutingApplication,
} from "../application/routing.ts";
import type { RoutingDecision } from "./types.ts";

interface RoutingTelemetryConfig {
  eventRepository?: EventRepository | null;
  application?: Pick<RoutingApplication, "recordRoutingEvent"> | null;
}

let eventRepository: EventRepository | null = null;
let application: Pick<RoutingApplication, "recordRoutingEvent"> = routingApplication;

export function configureRoutingTelemetry(config: RoutingTelemetryConfig): void {
  eventRepository = config.eventRepository ?? null;
  application = config.application ?? routingApplication;
}

export async function recordRoutingEvent(
  decision: RoutingDecision,
  taskId: string,
  orgId: string,
  dryRun: boolean,
): Promise<void> {
  await application.recordRoutingEvent({
    decision,
    taskId,
    orgId,
    dryRun,
    eventRepository,
  });
}
