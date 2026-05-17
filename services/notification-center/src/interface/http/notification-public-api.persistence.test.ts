import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NotFoundException } from "@nestjs/common";

import {
  NOTIFICATION_CENTER_ENTITIES,
  NotificationChannelSettingsEntity,
  NotificationMuteEntity,
  NotificationPushSubscriptionEntity,
  NotificationQuietHoursSettingsEntity,
  NotificationReadStateEntity,
  NotificationRuleSettingsEntity,
} from "@notification-center/infrastructure/database/notification.entities.ts";
import { NotificationReadState1778750400000 } from "@notification-center/infrastructure/database/notification-read-state.migration.ts";
import { NotificationSettings1778750500000 } from "@notification-center/infrastructure/database/notification-settings.migration.ts";
import { NotificationPublicStore } from "@notification-center/infrastructure/database/notification-public-store.ts";
import {
  NotificationPublicApiController,
  NotificationPublicApiService,
} from "@notification-center/interface/http/notification-public-api.controller.ts";
import {
  type FulcrumTypeOrmConnectionSource,
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { startTemporaryPostgres, type TemporaryPostgres } from "@test-support/temporary-postgres.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;
let postgres: TemporaryPostgres | undefined;

async function startPgliteSocket(): Promise<string> {
  pglite = await PGlite.create();
  await pglite.waitReady;

  socketServer = new PGLiteSocketServer({
    db: pglite,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  await socketServer.start();

  const [host, port] = socketServer.getServerConn().split(":");
  return `postgresql://postgres:postgres@${host}:${port}/postgres`;
}

afterEach(async () => {
  if (socketServer) {
    await socketServer.stop();
    socketServer = undefined;
  }
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
});

async function assertNotificationPublicApiRoundTrip(
  source: FulcrumTypeOrmConnectionSource,
  url: string,
): Promise<void> {
  const dataSource = createFulcrumTypeOrmDataSource(
    buildFulcrumTypeOrmOptions({
      source,
      url,
      entities: NOTIFICATION_CENTER_ENTITIES,
      migrations: [NotificationReadState1778750400000, NotificationSettings1778750500000],
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    expect(migrations.map((migration) => migration.name)).toEqual([
      "NotificationReadState1778750400000",
      "NotificationSettings1778750500000",
    ]);

    await dataSource.getRepository(NotificationReadStateEntity).save([
      {
        id: NOTIFICATION_ID,
        orgId: ORG_ID,
        userId: USER_ID,
        ruleId: null,
        eventId: "77777777-7777-4777-8777-777777777777",
        title: "Review finished",
        body: "The final review passed.",
        entityKind: "review",
        entityId: "88888888-8888-4888-8888-888888888888",
        readAt: null,
        traceId: `trace-notification-${source}`,
        createdAt: new Date("2026-05-14T08:00:00.000Z"),
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        orgId: ORG_ID,
        userId: OTHER_USER_ID,
        ruleId: null,
        eventId: "99999999-9999-4999-8999-999999999999",
        title: "Other user",
        body: "This must stay scoped away.",
        entityKind: "task",
        entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        readAt: null,
        traceId: `trace-other-${source}`,
        createdAt: new Date("2026-05-14T09:00:00.000Z"),
      },
    ]);

    const controller = new NotificationPublicApiController(
      new NotificationPublicApiService(
        { featuresEnv: "public-api" },
        new NotificationPublicStore(dataSource),
      ),
    );

    await expect(controller.listNotifications({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: NOTIFICATION_ID,
          orgId: ORG_ID,
          userId: USER_ID,
          title: "Review finished",
          read: false,
          traceId: `trace-notification-${source}`,
        }),
      ],
    });
    await expect(controller.unreadCount({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({ count: 1 });

    await expect(controller.markRead({ id: NOTIFICATION_ID }, { orgId: ORG_ID, userId: USER_ID })).resolves.toBeUndefined();
    await expect(controller.listNotifications({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: NOTIFICATION_ID,
          read: true,
          readAt: expect.any(String),
        }),
      ],
    });
    await dataSource.getRepository(NotificationReadStateEntity).save({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      orgId: ORG_ID,
      userId: USER_ID,
      ruleId: null,
      eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Second unread",
      body: "Second unread body.",
      entityKind: "task",
      entityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      readAt: null,
      traceId: `trace-second-${source}`,
      createdAt: new Date("2026-05-14T10:00:00.000Z"),
    });
    await expect(controller.listNotifications({
      orgId: ORG_ID,
      userId: USER_ID,
      unread: true,
      limit: 1,
      offset: 0,
    })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          read: false,
        }),
      ],
    });
    await expect(controller.markAllRead({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({ count: 1 });
    await expect(controller.unreadCount({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({ count: 0 });
    await expect(
      controller.markRead({ id: NOTIFICATION_ID }, { orgId: ORG_ID, userId: OTHER_USER_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await dataSource.getRepository(NotificationRuleSettingsEntity).save({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      orgId: ORG_ID,
      userId: USER_ID,
      subjectKind: "task",
      active: true,
      name: "Task assigned",
      eventPattern: { deliveryMode: "digest", digestWindowSeconds: 300, critical: true },
      channels: ["in-app", "email"],
      enabled: true,
      createdAt: new Date("2026-05-14T11:00:00.000Z"),
      updatedAt: new Date("2026-05-14T11:00:00.000Z"),
    });
    await dataSource.getRepository(NotificationQuietHoursSettingsEntity).save({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      orgId: ORG_ID,
      userId: USER_ID,
      tz: "Asia/Amman",
      startHour: 23,
      endHour: 6,
      daysOfWeek: [0, 6],
    });

    await expect(controller.getSettings({ orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      channels: [
        { name: "in-app", enabled: true, configurable: false },
        { name: "email", enabled: true, configurable: true },
        { name: "slack", enabled: true, configurable: true },
        { name: "discord", enabled: true, configurable: true },
        { name: "webhook", enabled: true, configurable: true },
        { name: "push", enabled: true, configurable: true },
      ],
      rules: [
        expect.objectContaining({
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          name: "Task assigned",
          deliveryMode: "digest",
          digestWindowSeconds: 300,
          critical: true,
          channels: ["in-app", "email"],
        }),
      ],
      quietHours: expect.objectContaining({
        tz: "Asia/Amman",
        startHour: 23,
        endHour: 6,
        daysOfWeek: [0, 6],
      }),
    });
    await expect(controller.listRules({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual([
      expect.objectContaining({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Task assigned" }),
    ]);
    await expect(controller.getRule(
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
      { orgId: ORG_ID, userId: USER_ID },
    )).resolves.toMatchObject({ name: "Task assigned", deliveryMode: "digest" });
    const createdRule = await controller.createRule(
      { orgId: ORG_ID, userId: USER_ID },
      {
        name: "Build failed",
        subjectKind: "run",
        eventPattern: { verb: "run.failed" },
        channels: ["in-app", "webhook"],
        enabled: true,
        deliveryMode: "delayed",
        delaySeconds: 60,
      },
    ) as { id: string };
    expect(createdRule).toMatchObject({
      name: "Build failed",
      subjectKind: "run",
      channels: ["in-app", "webhook"],
      deliveryMode: "delayed",
      delaySeconds: 60,
    });
    await expect(controller.updateRule(
      { id: createdRule.id },
      { orgId: ORG_ID, userId: USER_ID },
      { enabled: false, channels: ["email"] },
    )).resolves.toMatchObject({
      id: createdRule.id,
      enabled: false,
      active: false,
      channels: ["email"],
    });
    await expect(controller.deleteRule({ id: createdRule.id }, { orgId: ORG_ID, userId: USER_ID })).resolves.toEqual({
      ok: true,
    });
    await expect(controller.getRule(
      { id: createdRule.id },
      { orgId: ORG_ID, userId: USER_ID },
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.getQuietHours({ orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      tz: "Asia/Amman",
      startHour: 23,
      endHour: 6,
    });
    await expect(controller.setQuietHours(
      { orgId: ORG_ID, userId: USER_ID },
      { tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] },
    )).resolves.toMatchObject({
      tz: "UTC",
      startHour: 22,
      endHour: 7,
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    await expect(controller.mute(
      { orgId: ORG_ID, userId: USER_ID },
      {
        subjectKind: "task",
        subjectId: "task-1",
        mutedUntil: "2026-05-15T00:00:00.000Z",
      },
    )).resolves.toMatchObject({
      orgId: ORG_ID,
      userId: USER_ID,
      subjectKind: "task",
      subjectId: "task-1",
      mutedUntil: "2026-05-15T00:00:00.000Z",
    });
    await expect(controller.listMutes({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual([
      expect.objectContaining({ subjectKind: "task", subjectId: "task-1" }),
    ]);
    await expect(dataSource.getRepository(NotificationMuteEntity).findOneBy({
      orgId: ORG_ID,
      userId: USER_ID,
      subjectKind: "task",
      subjectId: "task-1",
    })).resolves.toMatchObject({ mutedUntil: new Date("2026-05-15T00:00:00.000Z") });
    await expect(controller.unmute(
      { subjectKind: "task", subjectId: "task-1" },
      { orgId: ORG_ID, userId: USER_ID },
    )).resolves.toEqual({ ok: true });
    await expect(controller.listMutes({ orgId: ORG_ID, userId: USER_ID })).resolves.toEqual([]);
    await expect(controller.configureChannel(
      { channel: "webhook" },
      { orgId: ORG_ID, userId: USER_ID },
      {
        enabled: true,
        url: `https://hooks.example.test/${source}`,
        secret: "webhook-secret",
      },
    )).resolves.toEqual({ ok: true });
    await expect(dataSource.getRepository(NotificationChannelSettingsEntity).findOneBy({
      orgId: ORG_ID,
      userId: USER_ID,
      kind: "webhook",
    })).resolves.toMatchObject({
      enabled: true,
      config: {
        url: `https://hooks.example.test/${source}`,
        secret: "webhook-secret",
      },
    });
    await expect(controller.getSettings({ orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      channels: expect.arrayContaining([
        expect.objectContaining({
          name: "webhook",
          enabled: true,
          config: {
            url: `https://hooks.example.test/${source}`,
            secretConfigured: true,
          },
        }),
      ]),
    });

    await expect(controller.configureChannel(
      { channel: "push" },
      { orgId: ORG_ID, userId: USER_ID },
      {
        subscription: JSON.stringify({
          endpoint: `https://push.example.test/${source}`,
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
          userAgent: "test-agent",
        }),
      },
    )).resolves.toEqual({ ok: true });
    await expect(dataSource.getRepository(NotificationPushSubscriptionEntity).findOneBy({
      userId: USER_ID,
      endpoint: `https://push.example.test/${source}`,
    })).resolves.toMatchObject({
      orgId: ORG_ID,
      p256dh: "p256dh-key",
      auth: "auth-key",
      userAgent: "test-agent",
    });
    await expect(controller.testChannel({ channel: "push" }, { orgId: ORG_ID, userId: USER_ID })).resolves.toMatchObject({
      channel: "push",
      status: "pending",
    });
  } finally {
    await dataSource.destroy();
  }
}

describe("notification public API TypeORM persistence", () => {
  test("serves list and mark-read through PGlite socket", async () => {
    await assertNotificationPublicApiRoundTrip("pglite-socket", await startPgliteSocket());
  });

  test("serves list and mark-read through real PostgreSQL", async () => {
    postgres = await startTemporaryPostgres();
    await assertNotificationPublicApiRoundTrip("postgres", postgres.url);
  });
});
