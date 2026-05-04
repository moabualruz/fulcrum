import { describe, expect, it } from "bun:test";

import {
  createAuditPruneTask,
  registerAuditPruneCron,
  type AuditRetentionRepositories,
} from "../../src/notifications/audit-retention.ts";

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";

type ExpiredEvent = {
  id: string;
  orgId: string;
  createdAt: Date;
};

function createRepos(options: {
  policies?: Array<{ orgId: string; retainDays: number }>;
  expired?: Record<string, ExpiredEvent[]>;
} = {}) {
  const policies = options.policies ?? [{ orgId: ORG_A, retainDays: 30 }];
  const expired = new Map(Object.entries(options.expired ?? {
    [ORG_A]: [
      { id: "event-old-1", orgId: ORG_A, createdAt: new Date("2026-04-01T00:00:00.000Z") },
      { id: "event-old-2", orgId: ORG_A, createdAt: new Date("2026-04-02T00:00:00.000Z") },
    ],
  }));
  const auditEvents: Array<Record<string, unknown>> = [];
  const deletedBatches: string[][] = [];
  const policyLookups: Array<{ orgId: string; retainDays: number; cutoff: Date }> = [];
  const notificationPrunes: Array<{ orgId: string; cutoff: Date }> = [];
  const deliveryPrunes: Array<{ orgId: string; cutoff: Date }> = [];

  const repos: AuditRetentionRepositories = {
    retentionPolicyRepo: {
      async findActivePolicies() {
        return policies;
      },
    },
    eventRepo: {
      async findExpiredForRetention(orgId, retainDays, cutoff) {
        policyLookups.push({ orgId, retainDays, cutoff });
        return expired.get(orgId) ?? [];
      },
      async create(data) {
        auditEvents.push(data);
        return data;
      },
      async deleteMany(ids) {
        deletedBatches.push(ids);
      },
    },
    notificationRepo: {
      async pruneExpired(orgId, cutoff) {
        notificationPrunes.push({ orgId, cutoff });
      },
    },
    notificationDeliveryRepo: {
      async pruneExpired(orgId, cutoff) {
        deliveryPrunes.push({ orgId, cutoff });
      },
    },
  };

  return { repos, auditEvents, deletedBatches, policyLookups, notificationPrunes, deliveryPrunes };
}

describe("audit retention cron", () => {
  it("deletes events older than retainDays and logs a surviving prune summary first", async () => {
    const { repos, auditEvents, deletedBatches, policyLookups, notificationPrunes, deliveryPrunes } = createRepos();

    const result = await createAuditPruneTask(repos, {
      now: new Date("2026-05-03T12:00:00.000Z"),
      batchSize: 1000,
      delayMs: 0,
    })();

    expect(policyLookups).toEqual([{
      orgId: ORG_A,
      retainDays: 30,
      cutoff: new Date("2026-04-03T12:00:00.000Z"),
    }]);
    expect(auditEvents).toEqual([expect.objectContaining({
      orgId: ORG_A,
      verb: "audit.pruned",
      subjectKind: "audit",
      subjectId: ORG_A,
      payload: {
        count: 2,
        oldest_deleted_at: "2026-04-01T00:00:00.000Z",
        retain_days: 30,
        cutoff: "2026-04-03T12:00:00.000Z",
      },
    })]);
    expect(deletedBatches).toEqual([["event-old-1", "event-old-2"]]);
    expect(notificationPrunes).toEqual([{ orgId: ORG_A, cutoff: new Date("2026-04-03T12:00:00.000Z") }]);
    expect(deliveryPrunes).toEqual([{ orgId: ORG_A, cutoff: new Date("2026-04-03T12:00:00.000Z") }]);
    expect(result).toEqual({ orgsScanned: 1, eventsDeleted: 2, pruneEventsCreated: 1 });
  });

  it("skips retainDays zero policies", async () => {
    const { repos, auditEvents, deletedBatches, policyLookups } = createRepos({
      policies: [{ orgId: ORG_A, retainDays: 0 }],
    });

    const result = await createAuditPruneTask(repos, { now: new Date("2026-05-03T12:00:00.000Z") })();

    expect(policyLookups).toEqual([]);
    expect(auditEvents).toEqual([]);
    expect(deletedBatches).toEqual([]);
    expect(result).toEqual({ orgsScanned: 0, eventsDeleted: 0, pruneEventsCreated: 0 });
  });

  it("splits large prunes into configured batches", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `event-${index}`,
      orgId: ORG_B,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    const { repos, deletedBatches } = createRepos({
      policies: [{ orgId: ORG_B, retainDays: 30 }],
      expired: { [ORG_B]: rows },
    });

    await createAuditPruneTask(repos, {
      now: new Date("2026-05-03T12:00:00.000Z"),
      batchSize: 1000,
      delayMs: 0,
    })();

    expect(deletedBatches.map((batch) => batch.length)).toEqual([1000, 1]);
  });

  it("registers audit.prune-events as a daily worker cron", () => {
    const jobs: Array<{ name: string; task: unknown; spec: string }> = [];
    const worker = {
      addTask(name: string, task: unknown) {
        jobs.push({ name, task, spec: "" });
      },
      addCron(name: string, spec: string) {
        const job = jobs.find((candidate) => candidate.name === name);
        if (job) job.spec = spec;
      },
    };
    const { repos } = createRepos();

    registerAuditPruneCron(worker, repos);

    expect(jobs).toEqual([{ name: "audit.prune-events", task: expect.any(Function), spec: "0 3 * * *" }]);
  });
});
