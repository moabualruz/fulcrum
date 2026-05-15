import { describe, expect, it } from "bun:test";

import { DEFAULT_NOTIFICATION_RULES } from "@notification-center/application/delivery-runtime/defaults.ts";
import {
  createNotifyFanoutTask,
  enqueueNotifyFanout,
  type NotificationQuietHoursLike,
  type NotifyFanoutRepositories,
} from "@notification-center/application/delivery-runtime/fanout-worker.ts";
import { DeliveryStatus } from "@notification-center/infrastructure/database/entities/notifications/index.ts";
import type { NotificationRuleLike } from "@notification-center/application/delivery-runtime/rule-engine.ts";

const ORG_ID = "00000000-0000-0000-0000-00000000000a";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_ID = "22222222-2222-2222-2222-222222222222";
const TASK_ID = "33333333-3333-3333-3333-333333333333";

type Mute = {
  orgId: string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  mutedUntil?: Date | string | null;
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    orgId: ORG_ID,
    verb: "assigned",
    subjectKind: "task",
    subjectId: TASK_ID,
    payload: { assignee_id: USER_ID },
    ...overrides,
  };
}

function rule(overrides: Partial<NotificationRuleLike> = {}): NotificationRuleLike {
  return {
    id: crypto.randomUUID(),
    orgId: ORG_ID,
    userId: USER_ID,
    enabled: true,
    active: true,
    name: "assignment-to-me",
    eventPattern: {
      subject_kind: "task",
      verb: "assigned",
      payload_path_eq: [{ path: "assignee_id", value: "$current_user_id" }],
    },
    channels: ["in-app"],
    ...overrides,
  };
}

function createRepos(options: {
  event?: ReturnType<typeof event>;
  rules?: NotificationRuleLike[];
  mutes?: Mute[];
  quietHours?: NotificationQuietHoursLike | null;
} = {}) {
  const notifications: Array<Record<string, unknown>> = [];
  const deliveries: Array<Record<string, unknown>> = [];
  const jobs: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const rules = options.rules ?? [rule({ id: "44444444-4444-4444-4444-444444444444" })];
  const repos: NotifyFanoutRepositories = {
    eventRepo: {
      async findOneOrFail(id: string) {
        expect(id).toBe(EVENT_ID);
        return options.event ?? event();
      },
    },
    notificationRuleRepo: {
      async find(where: Record<string, unknown>) {
        return rules.filter((candidate) =>
          candidate.orgId === where["orgId"] && candidate.enabled === where["enabled"]
        );
      },
    },
    notificationMuteRepo: {
      async findOne(where: Record<string, unknown>) {
        return options.mutes?.find((mute) =>
          mute["orgId"] === where["orgId"] &&
          mute["userId"] === where["userId"] &&
          mute["subjectKind"] === where["subjectKind"] &&
          mute["subjectId"] === where["subjectId"]
        ) ?? null;
      },
    },
    notificationQuietHoursRepo: {
      async findOne(where: Record<string, unknown>) {
        if (options.quietHours === undefined) return null;
        expect(where).toEqual({ orgId: ORG_ID, userId: USER_ID });
        return options.quietHours;
      },
    },
    notificationRepo: {
      async upsertFromMatch(match, matchedEvent) {
        const existing = notifications.find((notification) =>
          notification["userId"] === match.userId &&
          notification["eventId"] === matchedEvent.id &&
          notification["ruleId"] === match.rule.id
        );
        if (existing) return existing;
        const stored = {
          id: crypto.randomUUID(),
          orgId: ORG_ID,
          userId: match.userId,
          eventId: matchedEvent.id,
          ruleId: match.rule.id,
        };
        notifications.push(stored);
        return stored;
      },
    },
    notificationDeliveryRepo: {
      async create(data: Record<string, unknown>) {
        const stored = { id: crypto.randomUUID(), ...data };
        deliveries.push(stored);
        return stored;
      },
    },
    queue: {
      async addJob(name: string, payload: Record<string, unknown>) {
        jobs.push({ name, payload });
      },
    },
    featureFlags: {
      async isEnabled() {
        return true;
      },
    },
  };
  return { repos, notifications, deliveries, jobs };
}

describe("notify fanout worker", () => {
  it("dedups in-app notifications by user, event, and rule across repeated jobs", async () => {
    const { repos, notifications } = createRepos();
    const task = createNotifyFanoutTask(repos);

    await task({ eventId: EVENT_ID });
    await task({ eventId: EVENT_ID });

    expect(notifications).toHaveLength(1);
  });

  it("does not create notifications when matches are muted or disabled", async () => {
    const muted = createRepos({
      mutes: [{ orgId: ORG_ID, userId: USER_ID, subjectKind: "task", subjectId: TASK_ID }],
    });
    const disabled = createRepos({ rules: [rule({ enabled: false })] });

    await createNotifyFanoutTask(muted.repos)({ eventId: EVENT_ID });
    await createNotifyFanoutTask(disabled.repos)({ eventId: EVENT_ID });

    expect(muted.notifications).toHaveLength(0);
    expect(disabled.notifications).toHaveLength(0);
  });

  it("queues retry-after-quiet instead of channel delivery during quiet hours", async () => {
    const { repos, notifications, deliveries, jobs } = createRepos({
      rules: [rule({ channels: ["in-app", "email"] })],
      quietHours: { orgId: ORG_ID, userId: USER_ID, tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    });

    await createNotifyFanoutTask(repos, { now: new Date("2026-05-03T23:30:00.000Z") })({ eventId: EVENT_ID });

    expect(notifications).toHaveLength(1);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      channel: "email",
      status: "held-quiet-hours",
      attemptCount: 0,
      payload: expect.objectContaining({ eventId: EVENT_ID }),
    });
    expect(jobs).toEqual([{
      name: "notify-retry-after-quiet",
      payload: expect.objectContaining({ eventId: EVENT_ID, userId: USER_ID, channel: "email" }),
    }]);
  });

  it("queues channel delivery with pending status outside quiet hours", async () => {
    const { repos, deliveries, jobs } = createRepos({
      rules: [rule({ channels: ["email"] })],
      quietHours: { orgId: ORG_ID, userId: USER_ID, tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    });

    await createNotifyFanoutTask(repos, { now: new Date("2026-05-03T12:30:00.000Z") })({ eventId: EVENT_ID });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      channel: "email",
      status: DeliveryStatus.Pending,
      attemptCount: 0,
      payload: expect.objectContaining({ eventId: EVENT_ID }),
    });
    expect(jobs).toEqual([{
      name: "notify-deliver-email",
      payload: expect.objectContaining({ eventId: EVENT_ID, userId: USER_ID, channel: "email" }),
    }]);
  });

  it("all four default rules fan out for their trigger events", async () => {
    const triggerEvents = [
      event({ verb: "assigned", subjectKind: "task", payload: { assignee_id: USER_ID } }),
      event({ verb: "mentioned", subjectKind: "doc", payload: { mentioned_user_id: USER_ID } }),
      event({ verb: "changed", subjectKind: "sprint", payload: { sprint_id: "$sprint_of_my_tasks" } }),
      event({ verb: "completed", subjectKind: "agent_run", payload: { task_id: "$tasks_assigned_to_current_user" } }),
    ];

    for (const [index, defaultRule] of DEFAULT_NOTIFICATION_RULES.entries()) {
      const { repos, notifications } = createRepos({
        event: triggerEvents[index],
        rules: [rule({
          name: defaultRule.name,
          subjectKind: defaultRule.subjectKind,
          eventPattern: defaultRule.eventPattern,
        })],
      });

      await createNotifyFanoutTask(repos)({ eventId: EVENT_ID });

      expect(notifications).toHaveLength(1);
    }
  });

  it("event write hook enqueues notify-fan-out with the event id", async () => {
    const { repos, jobs } = createRepos();

    await enqueueNotifyFanout(repos.queue, EVENT_ID);

    expect(jobs).toEqual([{ name: "notify-fan-out", payload: { eventId: EVENT_ID } }]);
  });
});
