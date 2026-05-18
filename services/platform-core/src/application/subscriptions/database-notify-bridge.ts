/**
 * Database notification -> EventBus bridge.
 *
 * Topics: agent_run.<id>, project.<id>.tasks, org.<id>.notifications, orchestration.<orgId>.
 */

import { createSubscriptionEvent, serializeSubscriptionEvent, type EventBus } from "./event-bus.ts";

const CHANNEL_PREFIX_MAP: Record<string, string> = {
  agent_run: "agent_run",
  project_tasks: "project.tasks",
  org_notifications: "org.notifications",
  orchestration: "orchestration",
} as const;

export interface NotifyBridgeClient {
  listen(channel: string, callback: (payload: string) => void): Promise<() => void>;
  notify?(channel: string, payload: string): Promise<void>;
}

export interface NotifyBridgeOptions {
  client: NotifyBridgeClient;
  eventBus: EventBus;
}

export async function startNotifyBridge(
  opts: NotifyBridgeOptions,
): Promise<() => Promise<void>> {
  const { client, eventBus } = opts;
  const teardowns: Array<() => Promise<void>> = [];

  for (const [channel] of Object.entries(CHANNEL_PREFIX_MAP)) {
    const unsub = await client.listen(channel, (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as {
          topic: string;
          payload?: unknown;
          data: unknown;
          timestamp?: string;
        };
        if ("payload" in parsed) {
          eventBus.publishEvent({
            topic: parsed.topic,
            payload: parsed.payload,
            timestamp: parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
          });
          return;
        }
        eventBus.publish(parsed.topic, parsed.data);
      } catch {
        eventBus.publish(channel, payload);
      }
    });

    teardowns.push(async () => {
      unsub();
    });
  }

  return async () => {
    await Promise.all(teardowns.map((fn) => fn()));
  };
}

export async function emitNotify(
  client: NotifyBridgeClient,
  topic: string,
  data: unknown,
): Promise<void> {
  const event = serializeSubscriptionEvent(createSubscriptionEvent({
    topic,
    payload: data,
  }));
  await client.notify?.(topicToPGChannel(topic), JSON.stringify(event));
}

export function topicToPGChannel(topic: string): string {
  if (topic.startsWith("agent_run")) return "agent_run";
  if (topic.match(/^project\..+\.tasks$/)) return "project_tasks";
  if (topic.match(/^org\..+\.notifications$/)) return "org_notifications";
  if (topic.startsWith("orchestration")) return "orchestration";
  return topic.replace(/\./g, "_");
}
