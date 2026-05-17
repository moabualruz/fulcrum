import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import {
  countUnreadNotifications,
  getNotificationReadState,
  listNotificationReadStates,
  markAllNotificationReadStates,
  markNotificationReadState,
} from "@notification-center/application/notifications/read-state.ts";
import {
  NotificationReadStateEntity,
} from "@notification-center/infrastructure/database/notification.entities.ts";
import { NotificationReadState1778750400000 } from "@notification-center/infrastructure/database/notification-read-state.migration.ts";
import { NotificationReadStateStore } from "@notification-center/infrastructure/database/notification-read-state-store.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";
const READ_NOTIFICATION_ID = "55555555-5555-4555-8555-555555555555";
const FOREIGN_NOTIFICATION_ID = "66666666-6666-4666-8666-666666666666";

let pglite: PGlite | undefined;
let socketServer: PGLiteSocketServer | undefined;

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
});

describe("notification read-state TypeORM store", () => {
  test("preserves scoped list, get, unread, mark-read, and mark-all-read semantics", async () => {
    const dataSource = createFulcrumTypeOrmDataSource(
      buildFulcrumTypeOrmOptions({
        source: "pglite-socket",
        url: await startPgliteSocket(),
        entities: [NotificationReadStateEntity],
        migrations: [NotificationReadState1778750400000],
      }),
    );

    await dataSource.initialize();
    try {
      await dataSource.runMigrations();
      await dataSource.getRepository(NotificationReadStateEntity).save([
        {
          id: NOTIFICATION_ID,
          orgId: ORG_ID,
          userId: USER_ID,
          ruleId: null,
          eventId: "77777777-7777-4777-8777-777777777777",
          title: "Review ready",
          body: "The review loop is ready for UAT.",
          entityKind: "review",
          entityId: "88888888-8888-4888-8888-888888888888",
          readAt: null,
          traceId: "trace-review-ready",
          createdAt: new Date("2026-05-14T08:00:00.000Z"),
        },
        {
          id: READ_NOTIFICATION_ID,
          orgId: ORG_ID,
          userId: USER_ID,
          ruleId: null,
          eventId: "99999999-9999-4999-8999-999999999999",
          title: "Already read",
          body: "Already acknowledged.",
          entityKind: "task",
          entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          readAt: new Date("2026-05-14T08:30:00.000Z"),
          traceId: "trace-already-read",
          createdAt: new Date("2026-05-14T07:00:00.000Z"),
        },
        {
          id: FOREIGN_NOTIFICATION_ID,
          orgId: ORG_ID,
          userId: OTHER_USER_ID,
          ruleId: null,
          eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Other user",
          body: "Must stay scoped away.",
          entityKind: "task",
          entityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          readAt: null,
          traceId: "trace-other-user",
          createdAt: new Date("2026-05-14T09:00:00.000Z"),
        },
      ]);

      const store = new NotificationReadStateStore(dataSource);
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: null };

      await expect(listNotificationReadStates(store, ctx, { unread: true, limit: 50, offset: 0 })).resolves.toMatchObject({
        total: 1,
        items: [{ id: NOTIFICATION_ID, title: "Review ready", read: false }],
      });
      await expect(countUnreadNotifications(store, ctx)).resolves.toBe(1);
      await expect(getNotificationReadState(store, ctx, NOTIFICATION_ID)).resolves.toMatchObject({
        id: NOTIFICATION_ID,
        read: false,
      });
      await expect(getNotificationReadState(store, ctx, FOREIGN_NOTIFICATION_ID)).rejects.toBeInstanceOf(AppForbiddenError);

      await expect(markNotificationReadState(store, ctx, NOTIFICATION_ID)).resolves.toMatchObject({
        id: NOTIFICATION_ID,
        read: true,
        readAt: expect.any(Date),
      });
      await expect(markNotificationReadState(store, ctx, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).rejects.toBeInstanceOf(AppNotFoundError);

      await dataSource.getRepository(NotificationReadStateEntity).save({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        orgId: ORG_ID,
        userId: USER_ID,
        ruleId: null,
        eventId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        title: "Second unread",
        body: "Second unread body.",
        entityKind: "task",
        entityId: "12121212-1212-4212-8212-121212121212",
        readAt: null,
        traceId: "trace-second-unread",
        createdAt: new Date("2026-05-14T10:00:00.000Z"),
      });

      await expect(markAllNotificationReadStates(store, ctx)).resolves.toEqual({ count: 1 });
      await expect(countUnreadNotifications(store, ctx)).resolves.toBe(0);
    } finally {
      await dataSource.destroy();
    }
  });
});
