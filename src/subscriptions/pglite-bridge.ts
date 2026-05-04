/**
 * PGlite LISTEN/NOTIFY → EventBus bridge.
 *
 * P13#02: Wires PGlite channels to the in-process EventBus.
 * Topics: agent_run.<id>, project.<id>.tasks, org.<id>.notifications, orchestration.<orgId>.
 *
 * PGlite.listen(channel, callback) returns an unsubscribe function.
 * Channel names match topic prefixes (dots replaced with underscores for PG compatibility).
 */

import type { PGlite } from "@electric-sql/pglite";
import type { EventBus } from "./event-bus.ts";

/**
 * Canonical channels this bridge manages.
 * PG channel names use underscores; EventBus topics use dots.
 */
const CHANNEL_PREFIX_MAP: Record<string, string> = {
  agent_run: "agent_run",
  project_tasks: "project.tasks",
  org_notifications: "org.notifications",
  orchestration: "orchestration",
} as const;

export interface PGliteBridgeOptions {
  pglite: PGlite;
  eventBus: EventBus;
}

/**
 * Start listening on all known PGlite channels and forward events to the EventBus.
 *
 * Returns an async teardown function that removes all listeners.
 */
export async function startPGliteBridge(
  opts: PGliteBridgeOptions,
): Promise<() => Promise<void>> {
  const { pglite, eventBus } = opts;
  const teardowns: Array<() => Promise<void>> = [];

  for (const [pgChannel] of Object.entries(CHANNEL_PREFIX_MAP)) {
    const unsub = await pglite.listen(pgChannel, (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as {
          topic: string;
          data: unknown;
        };
        eventBus.publish(parsed.topic, parsed.data);
      } catch {
        // Non-JSON payload — publish raw string under the channel name.
        eventBus.publish(pgChannel, payload);
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

/**
 * Emit a NOTIFY from PGlite for a given topic.
 *
 * Resolves the PG channel from the topic prefix, then issues
 * `NOTIFY <channel>, '<json>'`.
 */
export async function emitNotify(
  pglite: PGlite,
  topic: string,
  data: unknown,
): Promise<void> {
  // Determine PG channel from topic prefix.
  const pgChannel = topicToPGChannel(topic);
  const payload = JSON.stringify({ topic, data });
  // PGlite supports parameterized NOTIFY via template literal.
  await pglite.query(`NOTIFY ${pgChannel}, '${escapePayload(payload)}'`);
}

/**
 * Map a dot-separated topic to a PG channel name.
 */
export function topicToPGChannel(topic: string): string {
  // agent_run.abc123 → agent_run
  if (topic.startsWith("agent_run")) return "agent_run";
  // project.xyz.tasks → project_tasks
  if (topic.match(/^project\..+\.tasks$/)) return "project_tasks";
  // org.xyz.notifications → org_notifications
  if (topic.match(/^org\..+\.notifications$/)) return "org_notifications";
  // orchestration.xyz → orchestration
  if (topic.startsWith("orchestration")) return "orchestration";
  // Fallback: replace dots with underscores.
  return topic.replace(/\./g, "_");
}

function escapePayload(s: string): string {
  return s.replace(/'/g, "''");
}
