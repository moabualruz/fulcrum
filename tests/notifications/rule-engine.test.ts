import { describe, expect, it } from "bun:test";
import { Container } from "@needle-di/core";

import {
  NotificationRuleEngine,
  evaluateRules,
  type NotificationRuleEngineRepositories,
} from "../../src/notifications/rule-engine.ts";
import { DeliveryStatus } from "../../src/db/entities/notifications/index.ts";

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const EVENT_ID = "33333333-3333-3333-3333-333333333333";
const TASK_ID = "44444444-4444-4444-4444-444444444444";

type StoredNotification = {
  orgId: string;
  userId: string;
  ruleId: string | null;
  eventId: string;
  title: string;
  body: string;
  entityKind: string;
  entityId: string;
};

type StoredDelivery = {
  orgId: string;
  ruleId: string;
  notificationId: string | null;
  userId: string;
  channel: string;
  status: DeliveryStatus;
  payload: Record<string, unknown>;
};

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    orgId: ORG_A,
    userId: USER_A,
    enabled: true,
    active: true,
    name: "assignment-to-me",
    eventPattern: {
      subject_kind: "task",
      verb: "assigned",
      project_id: "project-1",
      sprint_id: "sprint-1",
      payload_path_eq: [{ path: "assignee.id", value: "$current_user_id" }],
    },
    channels: ["in-app"],
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    orgId: ORG_A,
    verb: "assigned",
    subjectKind: "task",
    subjectId: TASK_ID,
    payload: {
      project_id: "project-1",
      sprint_id: "sprint-1",
      assignee: { id: USER_A },
      title: "Fix auth redirect",
    },
    ...overrides,
  };
}

function createRepos(options: {
  rules?: unknown[];
  mutes?: unknown[];
  enabledFlags?: string[];
} = {}) {
  const notifications: StoredNotification[] = [];
  const deliveries: StoredDelivery[] = [];
  const enabledFlags = new Set(options.enabledFlags ?? []);

  const repos: NotificationRuleEngineRepositories = {
    notificationRuleRepo: {
      async find(where: Record<string, unknown>) {
        return (options.rules ?? []).filter((candidate) => {
          const row = candidate as { orgId?: string; enabled?: boolean };
          return row.orgId === where["orgId"] && row.enabled === where["enabled"];
        }) as never[];
      },
    },
    notificationMuteRepo: {
      async findOne(where: Record<string, unknown>) {
        return (options.mutes ?? []).find((candidate) => {
          const row = candidate as {
            orgId?: string;
            userId?: string;
            subjectKind?: string;
            subjectId?: string;
          };
          return row.orgId === where["orgId"] &&
            row.userId === where["userId"] &&
            row.subjectKind === where["subjectKind"] &&
            row.subjectId === where["subjectId"];
        }) as never;
      },
    },
    notificationRepo: {
      async create(data: StoredNotification) {
        const stored = { id: crypto.randomUUID(), ...data };
        notifications.push(stored);
        return stored as never;
      },
    },
    notificationDeliveryRepo: {
      async create(data: StoredDelivery) {
        const stored = { id: crypto.randomUUID(), ...data };
        deliveries.push(stored);
        return stored as never;
      },
    },
    featureFlags: {
      async isEnabled(flag: string, ctx?: { orgId?: string; userId?: string }) {
        expect(ctx?.orgId).toBe(ORG_A);
        return enabledFlags.has(flag);
      },
    },
  };

  return { repos, notifications, deliveries };
}

describe("notification rule engine", () => {
  it("matches subject_kind, verb, project_id, sprint_id, and payload_path_eq, then writes notification and delivery rows", async () => {
    const { repos, notifications, deliveries } = createRepos({
      rules: [rule()],
    });

    const matches = await evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, repos);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.rule.id).toBeDefined();
    expect(matches[0]?.userId).toBe(USER_A);
    expect(matches[0]?.channels).toEqual(["in-app"]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      orgId: ORG_A,
      userId: USER_A,
      eventId: EVENT_ID,
      title: "assigned task",
      entityKind: "task",
      entityId: TASK_ID,
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      orgId: ORG_A,
      userId: USER_A,
      channel: "in-app",
      status: DeliveryStatus.Pending,
    });
  });

  it("resolves $current_user_id per rule owner, not triggering actor", async () => {
    const { repos } = createRepos({
      rules: [
        rule({ userId: USER_A }),
        rule({ userId: USER_B }),
      ],
    });

    const matches = await evaluateRules(event(), { orgId: ORG_A, currentUserId: "actor-id" }, repos);

    expect(matches.map((match) => match.userId)).toEqual([USER_A]);
  });

  it("suppresses a match when an active mute exists and allows expired mutes", async () => {
    const muted = createRepos({
      rules: [rule()],
      mutes: [{
        orgId: ORG_A,
        userId: USER_A,
        subjectKind: "task",
        subjectId: TASK_ID,
        mutedUntil: new Date("2999-01-01T00:00:00.000Z"),
      }],
    });
    const unmuted = createRepos({
      rules: [rule()],
      mutes: [{
        orgId: ORG_A,
        userId: USER_A,
        subjectKind: "task",
        subjectId: TASK_ID,
        mutedUntil: new Date("2000-01-01T00:00:00.000Z"),
      }],
    });

    await expect(evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, muted.repos))
      .resolves.toEqual([]);
    await expect(evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, unmuted.repos))
      .resolves.toHaveLength(1);
  });

  it("skips disabled rules and rules from other orgs", async () => {
    const { repos } = createRepos({
      rules: [
        rule({ enabled: false }),
        rule({ orgId: ORG_B }),
        rule({ eventPattern: { subject_kind: "doc" } }),
      ],
    });

    await expect(evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, repos))
      .resolves.toEqual([]);
  });

  it("gates non-in-app channels behind feature flags that default OFF", async () => {
    const gatedOff = createRepos({
      rules: [rule({ channels: ["in-app", "email", "webhook", "slack", "discord", "push"] })],
    });
    const gatedOn = createRepos({
      rules: [rule({ channels: ["in-app", "email", "webhook", "slack", "discord", "push"] })],
      enabledFlags: ["notify-email", "notify-webhook"],
    });

    const offMatches = await evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, gatedOff.repos);
    const onMatches = await evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, gatedOn.repos);

    expect(offMatches[0]?.channels).toEqual(["in-app"]);
    expect(gatedOff.deliveries.map((delivery) => delivery.channel)).toEqual(["in-app"]);
    expect(onMatches[0]?.channels).toEqual(["in-app", "email", "webhook"]);
    expect(gatedOn.deliveries.map((delivery) => delivery.channel)).toEqual(["in-app", "email", "webhook"]);
  });

  it("evaluates 1000 rules x 100 users under the p95 budget", async () => {
    const rules = Array.from({ length: 1000 }, (_, index) =>
      rule({
        id: crypto.randomUUID(),
        userId: `10000000-0000-0000-0000-${String(index % 100).padStart(12, "0")}`,
        eventPattern: { subject_kind: "task", verb: "assigned" },
      }));
    const { repos } = createRepos({ rules });
    const started = performance.now();

    const matches = await evaluateRules(event(), { orgId: ORG_A, currentUserId: USER_A }, repos);

    expect(matches).toHaveLength(1000);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("is resolvable from a needle-di container without decorator syntax", () => {
    const container = new Container();

    container.bind({ provide: NotificationRuleEngine, useValue: new NotificationRuleEngine() });

    expect(container.get(NotificationRuleEngine)).toBeInstanceOf(NotificationRuleEngine);
  });
});
