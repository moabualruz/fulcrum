import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { SubscriptionBridge, TuiSubscription } from "../subscriptions.ts";

type NotificationTab = "for-you" | "all";

export interface TuiNotification {
  id: string;
  sourceId: string;
  sourceKind: string;
  title: string;
  forYou?: boolean;
  read?: boolean;
}

export interface NotificationsScreenOptions {
  caller: {
    notify: {
      list: (input: { tab: NotificationTab }) => Promise<TuiNotification[]>;
      markRead: (input: { id: string }) => Promise<{ ok: boolean }>;
      mute: (input: { sourceKind: string; sourceId: string }) => Promise<{ ok: boolean }>;
    };
  };
  subscriptions?: SubscriptionBridge;
  initialBellCount?: number;
  onOpenEntity?: (entity: { kind: string; id: string }) => void;
}

export class NotificationsScreen {
  private tab: NotificationTab = "for-you";
  private notifications: TuiNotification[] = [];
  private cursor = 0;
  private bellCount: number;
  private subscriptions: TuiSubscription[] = [];

  constructor(private readonly opts: NotificationsScreenOptions) {
    this.bellCount = opts.initialBellCount ?? 0;
  }

  async load(): Promise<void> {
    await this.reload();
    this.subscribeOnce();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Inbox"));
    renderer.separator();
    renderer.writeln(`  Bell: ${this.bellCount}`);
    renderer.writeln(`  ${this.tab === "for-you" ? "[For you]" : "For you"}  ${this.tab === "all" ? "[All]" : "All"}`);
    renderer.writeln();

    if (this.notifications.length === 0) {
      renderer.writeln(c.dim("  No notifications."));
    } else {
      for (const notification of this.notifications) {
        const index = this.notifications.indexOf(notification);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const read = notification.read ? c.dim("[read]") : "[unread]";
        renderer.writeln(`${pointer} ${read} ${notification.title}  ${c.dim(`${notification.sourceKind}:${notification.sourceId}`)}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  Tab switch  R read  M mute  Enter open  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\t") {
      this.tab = this.tab === "for-you" ? "all" : "for-you";
      await this.reload();
      return true;
    }

    if (key === "R") {
      const notification = this.selectedNotification;
      if (!notification) return false;
      await this.opts.caller.notify.markRead({ id: notification.id });
      notification.read = true;
      this.bellCount = Math.max(0, this.bellCount - 1);
      return true;
    }

    if (key === "M") {
      const notification = this.selectedNotification;
      if (!notification) return false;
      await this.opts.caller.notify.mute({ sourceKind: notification.sourceKind, sourceId: notification.sourceId });
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.notifications.length - 1));
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }

    if (key === "\r") {
      const notification = this.selectedNotification;
      if (!notification) return false;
      this.opts.onOpenEntity?.({ kind: notification.sourceKind, id: notification.sourceId });
      return true;
    }

    return false;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
  }

  private get selectedNotification(): TuiNotification | undefined {
    return this.notifications[this.cursor];
  }

  private async reload(): Promise<void> {
    this.notifications = await this.opts.caller.notify.list({ tab: this.tab });
    this.cursor = Math.min(this.cursor, Math.max(0, this.notifications.length - 1));
  }

  private subscribeOnce(): void {
    if (!this.opts.subscriptions || this.subscriptions.length > 0) return;
    this.subscriptions.push(
      this.opts.subscriptions.subscribe<{ count: number }>("notifications.unreadCount", (payload) => {
        this.bellCount = payload.count;
      }),
    );
  }
}
