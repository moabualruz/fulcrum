import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { TRPCError } from "@trpc/server";

import { PGliteKyselyDialect } from "@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import {
  Notification,
  NotificationMute,
  NotificationQuietHours,
  NotificationRule,
} from "@platform-core/infrastructure/application-database/entities/notifications/index.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { notificationsRouter } from "@fulcrum/server/trpc/routers/notifications.ts";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000011";
const TASK_ID = "00000000-0000-4000-8000-000000000020";
const OTHER_TASK_ID = "00000000-0000-4000-8000-000000000021";

let orm: MikroORM;
let pglite: PGlite;

const createCaller = t.createCallerFactory(notificationsRouter);

function session(userId = USER_ID, orgId = ORG_ID) {
  return {
    id: `sess-${userId.slice(-4)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-4)}`,
    ipAddress: null,
    userAgent: null,
  };
}

function caller(em: EntityManager = orm.em.fork(), userId = USER_ID, orgId = ORG_ID) {
  return createCaller(
    createContext({
      session: session(userId, orgId) as unknown as import("better-auth").Session,
      orgId,
      userId,
      em,
      container: null,
    }),
  );
}

function unauthCaller() {
  return createCaller(
    createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    }),
  );
}

async function seedBase(em: EntityManager) {
  const now = new Date("2026-05-03T12:00:00.000Z");
  const org = em.create(Org, { id: ORG_ID, name: "Local", slug: "local", createdAt: now, updatedAt: now });
  const otherOrg = em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: now, updatedAt: now });
  const user = em.create(User, {
    id: USER_ID,
    orgId: ORG_ID,
    email: "user@local",
    name: "User",
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });
  const otherUser = em.create(User, {
    id: OTHER_USER_ID,
    orgId: OTHER_ORG_ID,
    email: "other@local",
    name: "Other",
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });
  em.persist([org, otherOrg, user, otherUser]);
  await em.flush();
}

async function seedNotification(em: EntityManager, input: {
  id?: string;
  orgId?: string;
  userId?: string;
  taskId?: string;
  title?: string;
  readAt?: Date | null;
  createdAt?: Date;
} = {}) {
  const org = await em.findOneOrFail(Org, { id: input.orgId ?? ORG_ID });
  const event = em.create(Event, {
    id: crypto.randomUUID(),
    org,
    verb: "assigned",
    subjectKind: "task",
    subjectId: input.taskId ?? TASK_ID,
    payload: { assignee_id: input.userId ?? USER_ID },
    createdAt: input.createdAt ?? new Date(),
  });
  const notification = em.create(Notification, {
    id: input.id ?? crypto.randomUUID(),
    org,
    userId: input.userId ?? USER_ID,
    eventId: event.id,
    title: input.title ?? "Task assigned",
    body: "Body",
    entityKind: "task",
    entityId: input.taskId ?? TASK_ID,
    readAt: input.readAt ?? null,
    createdAt: input.createdAt ?? new Date(),
  });
  em.persist([event, notification]);
  await em.flush();
  return notification;
}

beforeAll(async () => {
  pglite = new PGlite();
  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: new PGliteKyselyDialect(() => pglite),
    entities: [
      Org,
      User,
      Event,
      Notification,
      NotificationRule,
      NotificationMute,
      NotificationQuietHours,
    ],
  });
  await orm.schema.create();
});

afterAll(async () => {
  await orm.close(true);
  await pglite.close();
});

beforeEach(async () => {
  const em = orm.em.fork();
  await em.nativeDelete(NotificationQuietHours, {});
  await em.nativeDelete(NotificationMute, {});
  await em.nativeDelete(NotificationRule, {});
  await em.nativeDelete(Notification, {});
  await em.nativeDelete(Event, {});
  await em.nativeDelete(User, {});
  await em.nativeDelete(Org, {});
  await seedBase(orm.em.fork());
});

describe("notifications router", () => {
  it("requires authentication on protected procedures", async () => {
    let error: TRPCError | null = null;
    try {
      await unauthCaller().list({});
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error?.code).toBe("UNAUTHORIZED");
  });

  it("lists caller notifications with unread filter and pagination", async () => {
    const em = orm.em.fork();
    const older = await seedNotification(em, { title: "Older", createdAt: new Date("2026-05-02T12:00:00.000Z") });
    await seedNotification(em, { title: "Read", readAt: new Date("2026-05-03T12:00:00.000Z") });
    const newer = await seedNotification(em, { title: "Newer", createdAt: new Date("2026-05-04T12:00:00.000Z") });
    await seedNotification(em, { userId: OTHER_USER_ID, orgId: OTHER_ORG_ID, title: "Foreign" });

    const result = await caller().list({ unread: true, limit: 1, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: newer.id, title: "Newer", read: false });
    expect(result.total).toBe(2);
    expect(result.items.map((n) => n.id)).not.toContain(older.id);
  });

  it("marks notifications read and decrements unread count", async () => {
    const em = orm.em.fork();
    const notification = await seedNotification(em);
    await seedNotification(em, { title: "Second" });

    expect(await caller().unreadCount()).toEqual({ count: 2 });
    const marked = await caller().markRead({ id: notification.id });

    expect(marked.read).toBe(true);
    expect(marked.readAt).toBeInstanceOf(Date);
    expect(await caller().unreadCount()).toEqual({ count: 1 });
  });

  it("clears all unread notifications with markAllRead", async () => {
    await seedNotification(orm.em.fork());
    await seedNotification(orm.em.fork(), { title: "Second" });

    expect(await caller().markAllRead()).toEqual({ count: 2 });
    expect(await caller().unreadCount()).toEqual({ count: 0 });
  });

  it("round-trips notification rules CRUD", async () => {
    const input = {
      name: "assignment",
      subjectKind: "task",
      eventPattern: { subject_kind: "task", verb: "assigned" },
      channels: ["in-app", "email"] as Array<"in-app" | "email">,
      enabled: true,
    };

    const created = await caller().rules.create(input);
    expect(created).toMatchObject(input);

    expect(await caller().rules.get({ id: created.id })).toMatchObject(input);
    expect(await caller().rules.list()).toEqual([expect.objectContaining({
      name: input.name,
      subjectKind: input.subjectKind,
      channels: input.channels,
      enabled: input.enabled,
      eventPattern: expect.objectContaining(input.eventPattern),
    })]);

    const updated = await caller().rules.update({ id: created.id, enabled: false, channels: ["webhook"] });
    expect(updated).toMatchObject({ id: created.id, enabled: false, channels: ["webhook"] });

    await expect(caller().rules.delete({ id: created.id })).resolves.toEqual({ ok: true });
    expect(await caller().rules.get({ id: created.id })).toBeNull();
  });

  it("rejects unknown rule channels during validation", async () => {
    await expect(caller().rules.create({
      name: "bad",
      eventPattern: { verb: "assigned" },
      channels: ["fax"],
    } as any)).rejects.toThrow();
  });

  it("mutes and unmutes a subject for the caller", async () => {
    const mutedUntil = new Date("2026-12-31T00:00:00.000Z");

    const mute = await caller().mute({ subjectKind: "task", subjectId: TASK_ID, mutedUntil });
    expect(mute).toMatchObject({ subjectKind: "task", subjectId: TASK_ID, mutedUntil });

    await expect(caller().unmute({ subjectKind: "task", subjectId: TASK_ID })).resolves.toEqual({ ok: true });
    const rows = await orm.em.fork().find(NotificationMute, { userId: USER_ID });
    expect(rows).toHaveLength(0);
  });

  it("returns channels and queues a test delivery", async () => {
    const channels = await caller().channels.list();
    expect(channels.map((c) => c.name)).toEqual(["in-app", "email", "slack", "discord", "webhook", "push"]);

    const delivery = await caller().channels.test({ channel: "email" });
    expect(delivery).toMatchObject({ channel: "email", status: "pending" });
  });

  it("gets and sets quiet hours", async () => {
    expect(await caller().quietHours.get()).toBeNull();

    const saved = await caller().quietHours.set({
      tz: "UTC",
      startHour: 22,
      endHour: 7,
      daysOfWeek: [1, 2, 3, 4, 5],
    });

    expect(saved).toMatchObject({ tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [1, 2, 3, 4, 5] });
    expect(await caller().quietHours.get()).toMatchObject({ id: saved.id });
  });

  it("does not mark another subject or org notification as read", async () => {
    const own = await seedNotification(orm.em.fork(), { taskId: TASK_ID });
    const other = await seedNotification(orm.em.fork(), { taskId: OTHER_TASK_ID });

    await caller().markRead({ id: own.id });

    const otherRow = await orm.em.fork().findOneOrFail(Notification, { id: other.id });
    expect(otherRow.readAt).toBeNull();
  });
});
