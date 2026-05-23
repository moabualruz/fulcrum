import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { parseFeatures } from "@feature-flags/application/env-features.ts";
import { MemoryEventBus } from "./memory-event-bus.ts";

export const EVENT_BUS = Symbol("EVENT_BUS");
export type EventTransport = "memory" | "db-outbox" | "external";

export function resolveEventTransport(raw = process.env["FULCRUM_FEATURES"]): EventTransport {
  const flag = parseFeatures(raw).find((candidate) => candidate.name === "events.transport");
  if (flag?.backend === "db-outbox") return "db-outbox";
  if (flag?.backend === "external") return "external";
  return "memory";
}

export class EventBusModule {}

Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    MemoryEventBus,
    {
      provide: EVENT_BUS,
      useExisting: MemoryEventBus,
    },
  ],
  exports: [EVENT_BUS, MemoryEventBus],
})(EventBusModule);
