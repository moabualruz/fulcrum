export type OptimisticStatus = "pending" | "confirmed" | "failed";

export interface OptimisticEntry<T> {
  readonly id: string;
  readonly value: T;
  readonly status: OptimisticStatus;
  readonly error?: string;
  readonly traceId?: string;
  readonly createdAt: number;
}

export interface OptimisticCommitContext {
  traceId?: string;
}

export interface OptimisticFailureContext {
  message: string;
  traceId?: string;
}

export type OptimisticSubscriber<T> = (entries: ReadonlyArray<OptimisticEntry<T>>) => void;

/**
 * Generic optimistic mutation tracker. UI code calls apply() with the proposed
 * value, the store inserts a pending entry, and the caller resolves the result
 * via the returned commit/fail handles. Subscribers receive the full ordered
 * list of entries on every state change so Svelte runes can re-render the
 * dependent surface without coupling to the mutation site.
 */
export class OptimisticStore<T> {
  private entries: OptimisticEntry<T>[] = [];
  private readonly subscribers = new Set<OptimisticSubscriber<T>>();
  private readonly clock: () => number;

  constructor(options: { clock?: () => number } = {}) {
    this.clock = options.clock ?? Date.now;
  }

  list(): ReadonlyArray<OptimisticEntry<T>> {
    return this.entries;
  }

  subscribe(subscriber: OptimisticSubscriber<T>): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.entries);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  apply(id: string, value: T): {
    confirm: (context?: OptimisticCommitContext) => void;
    fail: (context: OptimisticFailureContext) => void;
    rollback: () => void;
  } {
    const entry: OptimisticEntry<T> = {
      id,
      value,
      status: "pending",
      createdAt: this.clock(),
    };
    this.entries = [...this.entries.filter((e) => e.id !== id), entry];
    this.notify();

    return {
      confirm: (context) => this.transition(id, "confirmed", { traceId: context?.traceId }),
      fail: (context) => this.transition(id, "failed", { error: context.message, traceId: context.traceId }),
      rollback: () => this.remove(id),
    };
  }

  remove(id: string): void {
    const next = this.entries.filter((e) => e.id !== id);
    if (next.length === this.entries.length) return;
    this.entries = next;
    this.notify();
  }

  retry(id: string, value: T): void {
    const existing = this.entries.find((e) => e.id === id);
    if (!existing) return;
    this.entries = this.entries.map((e) =>
      e.id === id
        ? { ...e, value, status: "pending", error: undefined, traceId: undefined }
        : e,
    );
    this.notify();
  }

  private transition(
    id: string,
    status: OptimisticStatus,
    patch: { error?: string; traceId?: string },
  ): void {
    const next = this.entries.map((e) =>
      e.id === id ? { ...e, status, error: patch.error, traceId: patch.traceId } : e,
    );
    if (next === this.entries) return;
    this.entries = next;
    this.notify();
  }

  private notify(): void {
    for (const subscriber of this.subscribers) {
      subscriber(this.entries);
    }
  }
}

/**
 * Tracks deletion intents with a configurable undo window. Pending deletions
 * expose a remaining-time readout that surfaces the inline undo affordance in
 * the same row that triggered the delete: never a toast.
 */
export interface PendingDeletion<TKey> {
  readonly key: TKey;
  readonly expiresAt: number;
  readonly remainingMs: number;
}

export class OptimisticDeletionQueue<TKey> {
  private readonly window: number;
  private readonly clock: () => number;
  private readonly pending = new Map<TKey, { expiresAt: number }>();
  private readonly subscribers = new Set<(items: ReadonlyArray<PendingDeletion<TKey>>) => void>();

  constructor(options: { windowMs?: number; clock?: () => number } = {}) {
    this.window = options.windowMs ?? 30_000;
    this.clock = options.clock ?? Date.now;
  }

  schedule(key: TKey): void {
    this.pending.set(key, { expiresAt: this.clock() + this.window });
    this.notify();
  }

  undo(key: TKey): boolean {
    const removed = this.pending.delete(key);
    if (removed) this.notify();
    return removed;
  }

  finalize(key: TKey): boolean {
    return this.undo(key);
  }

  list(): ReadonlyArray<PendingDeletion<TKey>> {
    const now = this.clock();
    return [...this.pending.entries()].map(([key, { expiresAt }]) => ({
      key,
      expiresAt,
      remainingMs: Math.max(0, expiresAt - now),
    }));
  }

  subscribe(subscriber: (items: ReadonlyArray<PendingDeletion<TKey>>) => void): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.list());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private notify(): void {
    const snapshot = this.list();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
  }
}
