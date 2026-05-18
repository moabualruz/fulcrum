/**
 * tRPC subscription procedures.
 *
 * Subscription procedures backed by EventBus (in-process EventEmitter).
 * Topics:
 *   - runs.onRunUpdate(runId)        → agent_run.<runId>
 *   - notify.onNewNotification()     → org.<orgId>.notifications
 *   - orchestration.onStateChange()  → orchestration.<orgId>
 */

import { z } from "zod";
import { observable } from "@trpc/server/observable";

import { t } from "@fulcrum/server/trpc/trpc.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import {
  getEventBus,
  serializeSubscriptionEvent,
  type SerializedSubscriptionEvent,
} from "@platform-core/application/subscriptions/event-bus.ts";

// --- Schemas ---

const RunUpdatePayloadSchema = z.object({
  runId: z.string(),
  status: z.string().optional(),
  logLine: z.string().optional(),
  timestamp: z.date(),
});
export type RunUpdatePayload = z.infer<typeof RunUpdatePayloadSchema>;
export type RunUpdateEvent = SerializedSubscriptionEvent<RunUpdatePayload>;

const NotificationPayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional(),
  entityKind: z.string().optional(),
  entityId: z.string().optional(),
  timestamp: z.date(),
});
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export type NotificationEvent = SerializedSubscriptionEvent<NotificationPayload>;

const OrchestrationStatePayloadSchema = z.object({
  runId: z.string().optional(),
  state: z.string(),
  previousState: z.string().optional(),
  timestamp: z.date(),
});
export type OrchestrationStatePayload = z.infer<typeof OrchestrationStatePayloadSchema>;
export type OrchestrationStateEvent = SerializedSubscriptionEvent<OrchestrationStatePayload>;

// --- Subscription procedures ---

export const runsSubscriptionRouter = t.router({
  onRunUpdate: permissionedProcedure({ resource: "runs", action: "onRunUpdate" })
    .input(z.object({ runId: z.string().min(1) }))
    .subscription(({ input }) => {
      const bus = getEventBus();
      const topic = `agent_run.${input.runId}`;

      return observable<RunUpdateEvent>((emit) => {
        const unsub = bus.subscribe<RunUpdatePayload>(topic, (event) => {
          emit.next(serializeSubscriptionEvent(event));
        });
        return unsub;
      });
    }),
});

export const notifySubscriptionRouter = t.router({
  onNewNotification: permissionedProcedure({ resource: "notify", action: "onNewNotification" })
    .subscription(({ ctx }) => {
      const bus = getEventBus();
      const topic = `org.${ctx.orgId}.notifications`;

      return observable<NotificationEvent>((emit) => {
        const unsub = bus.subscribe<NotificationPayload>(topic, (event) => {
          emit.next(serializeSubscriptionEvent(event));
        });
        return unsub;
      });
    }),
});

export const orchestrationSubscriptionRouter = t.router({
  onStateChange: permissionedProcedure({ resource: "orchestration", action: "onStateChange" })
    .subscription(({ ctx }) => {
      const bus = getEventBus();
      const topic = `orchestration.${ctx.orgId}`;

      return observable<OrchestrationStateEvent>((emit) => {
        const unsub = bus.subscribe<OrchestrationStatePayload>(topic, (event) => {
          emit.next(serializeSubscriptionEvent(event));
        });
        return unsub;
      });
    }),
});
