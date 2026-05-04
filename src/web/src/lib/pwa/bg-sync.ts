/**
 * Background sync queue for pwa-offline feature.
 *
 * Mutations made while offline are enqueued in memory (test) or IndexedDB
 * (browser). On reconnect, replay() is called to resend them.
 *
 * Design: storage abstraction lets unit tests use an in-memory array while
 * the browser runtime uses IndexedDB via a thin wrapper.
 */

export interface QueuedMutation {
  id: string;
  url: string;
  method: string;
  body: string;
  headers?: Record<string, string>;
  enqueuedAt: number;
}

/** Minimal storage interface — satisfied by both in-memory and IndexedDB impls. */
export interface MutationStorage {
  getAll(): Promise<QueuedMutation[]>;
  add(item: QueuedMutation): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory storage used in tests and when IndexedDB is unavailable. */
class MemoryStorage implements MutationStorage {
  private items: QueuedMutation[] = [];
  async getAll() { return [...this.items]; }
  async add(item: QueuedMutation) { this.items.push(item); }
  async remove(id: string) { this.items = this.items.filter((i) => i.id !== id); }
  async clear() { this.items = []; }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class BackgroundSyncQueue {
  private storage: MutationStorage;

  constructor(storage?: MutationStorage) {
    // Default to MemoryStorage; browser callers can inject an IndexedDB storage.
    this.storage = storage ?? new MemoryStorage();
  }

  /** Add a mutation to the offline queue. */
  async enqueue(mutation: Omit<QueuedMutation, "id" | "enqueuedAt">): Promise<void> {
    await this.storage.add({
      ...mutation,
      id: makeId(),
      enqueuedAt: Date.now(),
    });
  }

  /** Return all pending mutations (for inspection / tests). */
  async getPending(): Promise<QueuedMutation[]> {
    return this.storage.getAll();
  }

  /**
   * Replay all queued mutations using the provided fetch function.
   * Successfully replayed mutations are removed from the queue.
   * Failed ones remain for the next replay attempt.
   */
  async replay(fetchFn: typeof fetch = globalThis.fetch): Promise<void> {
    const pending = await this.storage.getAll();

    for (const mutation of pending) {
      try {
        const response = await fetchFn(mutation.url, {
          method: mutation.method,
          body: mutation.body,
          headers: mutation.headers ?? { "content-type": "application/json" },
        });

        if (response.ok) {
          await this.storage.remove(mutation.id);
        }
        // non-ok: leave in queue
      } catch {
        // network error: leave in queue
      }
    }
  }

  /** Clear the entire queue (use after successful full sync). */
  async clear(): Promise<void> {
    await this.storage.clear();
  }
}

/** Singleton queue for the browser runtime. */
export const bgSyncQueue = new BackgroundSyncQueue();
