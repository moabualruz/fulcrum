export interface BellCounterItem {
  id: string;
  kind: string;
  title: string;
}

export interface BellCounterScheduler<TInterval = unknown> {
  setInterval: (callback: () => void | Promise<void>, ms: number) => TInterval;
  clearInterval: (id: TInterval) => void;
}

export interface BellCounterSubscription {
  unsubscribe: () => void;
}

export interface BellCounterRealtimePayload {
  userId?: string;
  unreadCount: number;
}

export interface BellCounterPollOptions<TInterval = unknown> {
  realtimeEnabled: boolean;
  userId?: string | null;
  scheduler?: BellCounterScheduler<TInterval>;
  unreadCount: () => Promise<{ count: number }>;
  listUnread: (input: { limit: number; unread: true }) => Promise<{ items: BellCounterItem[] }>;
  markAllRead: () => Promise<{ count: number }>;
  subscribeRealtime?: (handler: (payload: BellCounterRealtimePayload) => void) => BellCounterSubscription;
  onCount?: (count: number) => void;
}

const DEFAULT_INTERVAL_MS = 60_000;

export class BellCounterPoll<TInterval = unknown> {
  private readonly scheduler: BellCounterScheduler<TInterval>;
  private interval: TInterval | null = null;
  private subscription: BellCounterSubscription | null = null;
  private count = 0;

  constructor(private readonly opts: BellCounterPollOptions<TInterval>) {
    this.scheduler = opts.scheduler ?? {
      setInterval: (callback, ms) => setInterval(callback, ms) as TInterval,
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    };
  }

  async start(): Promise<void> {
    await this.refresh();
    if (this.opts.realtimeEnabled && this.opts.subscribeRealtime) {
      this.subscription = this.opts.subscribeRealtime((payload) => {
        if (payload.userId && this.opts.userId && payload.userId !== this.opts.userId) return;
        this.setCount(payload.unreadCount);
      });
      return;
    }
    this.interval = this.scheduler.setInterval(() => {
      void this.refresh();
    }, DEFAULT_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval !== null) {
      this.scheduler.clearInterval(this.interval);
      this.interval = null;
    }
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  async refresh(): Promise<number> {
    const { count } = await this.opts.unreadCount();
    this.setCount(count);
    return this.count;
  }

  async openDropdown(): Promise<{ items: BellCounterItem[] }> {
    return this.opts.listUnread({ limit: 5, unread: true });
  }

  async clearForInboxVisit(): Promise<void> {
    await this.opts.markAllRead();
    this.setCount(0);
  }

  private setCount(count: number): void {
    this.count = Math.max(0, count);
    this.opts.onCount?.(this.count);
  }
}
