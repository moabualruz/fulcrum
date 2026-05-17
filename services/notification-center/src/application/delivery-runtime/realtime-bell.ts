// Real-time bell badge updates via Hocuspocus awareness.
// Gated behind FULCRUM_FEATURES=real-time-collab-server.
// When ON: broadcaster pushes unreadCount to connected clients <2s after insert.
// When OFF: clients fall back to 60s poll (BellCounterPoll handles this).

import {
  countUnreadNotifications,
  type NotificationReadStateReader,
} from "@notification-center/application/notifications/read-state.ts";
import type { AppContext } from "@notification-center/domain/notification.ts";

/** Minimal awareness server interface — satisfied by Hocuspocus Server. */
export interface AwarenessServer {
  broadcastAwareness(userId: string, data: Record<string, unknown>): void;
}

/** Broadcaster that fanout calls after inserting in-app notifications. */
export interface NotificationBroadcaster {
  onNotificationInserted(userId: string): Promise<void>;
}

export interface NotificationBroadcasterOptions {
  realtimeEnabled: boolean;
  awarenessServer: AwarenessServer;
  unreadCountForUser: (userId: string) => Promise<number>;
}

export function createApplicationUnreadCount(
  reader: NotificationReadStateReader,
  ctx: Omit<AppContext, "userId">,
): (userId: string) => Promise<number> {
  return (userId) => countUnreadNotifications(reader, { ...ctx, userId });
}

/**
 * Create a NotificationBroadcaster.
 * When realtimeEnabled=true, each onNotificationInserted call fetches the
 * user's current unread count and broadcasts it via awareness server.
 * When false, onNotificationInserted is a no-op — clients use 60s poll.
 */
export function createNotificationBroadcaster(
  opts: NotificationBroadcasterOptions,
): NotificationBroadcaster {
  return {
    async onNotificationInserted(userId: string): Promise<void> {
      if (!opts.realtimeEnabled) return;
      const count = await opts.unreadCountForUser(userId);
      opts.awarenessServer.broadcastAwareness(userId, { unreadCount: count });
    },
  };
}
