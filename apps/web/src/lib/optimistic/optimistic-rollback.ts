export const ROLLBACK_ESCALATION_THRESHOLD = 3;

export type RollbackPayload = Record<string, unknown>;

export interface RollbackFailure {
  readonly id: string;
  readonly attempts: number;
  readonly lastError: string;
  readonly lastTraceId?: string;
  readonly lastPayload?: RollbackPayload;
  readonly escalated: boolean;
}

export type RollbackSubscriber = (failures: ReadonlyArray<RollbackFailure>) => void;

/**
 * Tracks consecutive optimistic mutation failures keyed by stable mutation id.
 * After three failed attempts the failure escalates so the UI can expand the
 * inline error block with the last request payload and a troubleshooting link
 * — banning toasts and `Contact support` copy per `COPY.md` §Hard bans.
 */
export class OptimisticRollback {
  private readonly threshold: number;
  private readonly failures = new Map<string, RollbackFailure>();
  private readonly subscribers = new Set<RollbackSubscriber>();

  constructor(options: { threshold?: number } = {}) {
    this.threshold = options.threshold ?? ROLLBACK_ESCALATION_THRESHOLD;
  }

  recordFailure(input: {
    id: string;
    error: string;
    traceId?: string;
    payload?: RollbackPayload;
  }): RollbackFailure {
    const prior = this.failures.get(input.id);
    const attempts = (prior?.attempts ?? 0) + 1;
    const next: RollbackFailure = {
      id: input.id,
      attempts,
      lastError: input.error,
      lastTraceId: input.traceId,
      lastPayload: input.payload,
      escalated: attempts >= this.threshold,
    };
    this.failures.set(input.id, next);
    this.notify();
    return next;
  }

  clear(id: string): boolean {
    const removed = this.failures.delete(id);
    if (removed) this.notify();
    return removed;
  }

  resolve(id: string): boolean {
    return this.clear(id);
  }

  get(id: string): RollbackFailure | undefined {
    return this.failures.get(id);
  }

  list(): ReadonlyArray<RollbackFailure> {
    return [...this.failures.values()];
  }

  subscribe(subscriber: RollbackSubscriber): () => void {
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

export const ROLLBACK_TROUBLESHOOTING_HREF = "/docs/operations/troubleshooting-optimistic-failures" as const;
export const ROLLBACK_TROUBLESHOOTING_LABEL = "View troubleshooting" as const;
export const ROLLBACK_SUGGESTED_ACTIONS = [
  "Check network",
  "View logs",
] as const;
