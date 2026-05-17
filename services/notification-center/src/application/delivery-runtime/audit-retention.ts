export interface EventRetentionPolicyLike {
  orgId?: string;
  org?: { id?: string } | string;
  retainDays: number;
}

export interface AuditRetentionEventLike {
  id: string;
  orgId?: string;
  org?: { id?: string } | string;
  createdAt: Date;
}

export interface AuditRetentionRepositories {
  retentionPolicyRepo: {
    findActivePolicies(): Promise<EventRetentionPolicyLike[]>;
  };
  eventRepo: {
    findExpiredForRetention(
      orgId: string,
      retainDays: number,
      cutoff: Date,
    ): Promise<AuditRetentionEventLike[]>;
    create(data: Record<string, unknown>): Promise<unknown>;
    deleteMany(ids: string[]): Promise<unknown>;
  };
  notificationRepo?: {
    pruneExpired(orgId: string, cutoff: Date): Promise<unknown>;
  };
  notificationDeliveryRepo?: {
    pruneExpired(orgId: string, cutoff: Date): Promise<unknown>;
  };
}

export interface AuditRetentionOptions {
  now?: Date;
  batchSize?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AuditRetentionResult {
  orgsScanned: number;
  eventsDeleted: number;
  pruneEventsCreated: number;
}

export type AuditPruneTask = () => Promise<AuditRetentionResult>;

export interface AuditPruneWorker {
  addTask(name: string, task: AuditPruneTask): void;
  addCron(name: string, spec: string): void;
}

const TASK_NAME = "audit.prune-events";
const DAILY_CRON = "0 3 * * *";
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_DELAY_MS = 100;

export function createAuditPruneTask(
  repositories: AuditRetentionRepositories,
  options: AuditRetentionOptions = {},
): AuditPruneTask {
  return async () => pruneAuditEvents(repositories, options);
}

export function registerAuditPruneCron(
  worker: AuditPruneWorker,
  repositories: AuditRetentionRepositories,
  options: AuditRetentionOptions = {},
): void {
  worker.addTask(TASK_NAME, createAuditPruneTask(repositories, options));
  worker.addCron(TASK_NAME, DAILY_CRON);
}

export async function pruneAuditEvents(
  repositories: AuditRetentionRepositories,
  options: AuditRetentionOptions = {},
): Promise<AuditRetentionResult> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const policies = await repositories.retentionPolicyRepo.findActivePolicies();
  const result: AuditRetentionResult = {
    orgsScanned: 0,
    eventsDeleted: 0,
    pruneEventsCreated: 0,
  };

  for (const policy of policies) {
    if (policy.retainDays <= 0) continue;
    const orgId = scopedOrgId(policy);
    if (!orgId) continue;

    result.orgsScanned += 1;
    const cutoff = cutoffFor(now, policy.retainDays);
    await repositories.notificationRepo?.pruneExpired(orgId, cutoff);
    await repositories.notificationDeliveryRepo?.pruneExpired(orgId, cutoff);

    const expired = await repositories.eventRepo.findExpiredForRetention(orgId, policy.retainDays, cutoff);
    if (expired.length === 0) continue;

    await repositories.eventRepo.create({
      orgId,
      verb: "audit.pruned",
      subjectKind: "audit",
      subjectId: orgId,
      payload: {
        count: expired.length,
        oldest_deleted_at: oldestCreatedAt(expired)?.toISOString() ?? null,
        retain_days: policy.retainDays,
        cutoff: cutoff.toISOString(),
      },
    });
    result.pruneEventsCreated += 1;

    for (let index = 0; index < expired.length; index += batchSize) {
      const batch = expired.slice(index, index + batchSize);
      await repositories.eventRepo.deleteMany(batch.map((event) => event.id));
      result.eventsDeleted += batch.length;
      if (delayMs > 0 && index + batchSize < expired.length) {
        await sleep(delayMs);
      }
    }
  }

  return result;
}

function cutoffFor(now: Date, retainDays: number): Date {
  return new Date(now.getTime() - retainDays * 24 * 60 * 60 * 1000);
}

function oldestCreatedAt(events: AuditRetentionEventLike[]): Date | null {
  return events.reduce<Date | null>((oldest, event) => {
    if (!oldest || event.createdAt.getTime() < oldest.getTime()) return event.createdAt;
    return oldest;
  }, null);
}

function scopedOrgId(value: { orgId?: string; org?: { id?: string } | string }): string | undefined {
  if (value.orgId) return value.orgId;
  if (typeof value.org === "string") return value.org;
  return value.org?.id;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
