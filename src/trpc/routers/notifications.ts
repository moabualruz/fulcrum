import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createNotificationRule,
  deleteNotificationRule,
  markAllNotificationsRead,
  markNotificationRead as markNotificationReadCommand,
  muteNotificationSubject,
  setNotificationQuietHours,
  unmuteNotificationSubject,
  updateNotificationRule,
  upsertPushSubscription,
} from "../../application/notifications/commands.ts";
import {
  getNotificationQuietHours,
  getNotificationRule,
  listNotificationMutes,
  listNotificationRules,
  listNotifications,
  unreadNotificationCount,
} from "../../application/notifications/queries.ts";
import type { AppContext } from "../../application/notifications/types.ts";
import { AppNotFoundError } from "../../application/errors.ts";
import { permissionedProcedure } from "../middleware.ts";
import {
  ChannelNameSchema,
  DeliveryModeSchema,
  IdInputSchema,
  ListNotificationsInputSchema,
  MuteInputSchema,
  NotificationRuleCreateInputSchema,
  NotificationRuleUpdateInputSchema,
  QuietHoursSetInputSchema,
  SubjectInputSchema,
} from "../schemas/notifications.ts";
import { t } from "../trpc.ts";

type AuthCtx = { em: EntityManager | null; orgId: string; userId: string };
type NotificationCountRow = { orgId?: string; org?: string | { id?: string }; userId: string; readAt: Date | null };
type NotificationReadRow = { readAt: Date | null };

const CHANNELS = [
  { name: "in-app", enabled: true, configurable: false },
  { name: "email", enabled: true, configurable: true },
  { name: "slack", enabled: true, configurable: true },
  { name: "discord", enabled: true, configurable: true },
  { name: "webhook", enabled: true, configurable: true },
  { name: "push", enabled: true, configurable: true },
] as const;

const NotificationOutputSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  ruleId: z.string().uuid().nullable(),
  eventId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  entityKind: z.string(),
  entityId: z.string(),
  read: z.boolean(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

const NotificationListOutputSchema = z.object({
  items: z.array(NotificationOutputSchema),
  total: z.number().int().nonnegative(),
});

const NotificationRuleOutputSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  subjectKind: z.string().nullable(),
  active: z.boolean(),
  eventPattern: z.record(z.string(), z.unknown()),
  channels: z.array(ChannelNameSchema),
  enabled: z.boolean(),
  deliveryMode: DeliveryModeSchema,
  digestWindowSeconds: z.number().int().nullable(),
  delaySeconds: z.number().int().nullable(),
  critical: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const MuteOutputSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  subjectKind: z.string(),
  subjectId: z.string().uuid(),
  mutedUntil: z.date().nullable(),
});

const QuietHoursOutputSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  tz: z.string(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
});

export function calculateUnreadNotificationCount(
  rows: readonly NotificationCountRow[],
  scope: { orgId: string; userId: string },
): number {
  return rows.filter((row) => notificationOrgId(row) === scope.orgId && row.userId === scope.userId && row.readAt === null).length;
}

export function markNotificationRead(row: NotificationReadRow, now = new Date()): boolean {
  if (row.readAt !== null) return false;
  row.readAt = now;
  return true;
}

function requireEm(context: AuthCtx): EntityManager {
  if (!context.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return context.em;
}

function appContext(ctx: AuthCtx): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

function notificationOrgId(row: NotificationCountRow): string | undefined {
  return typeof row.org === "object" ? row.org.id : row.org ?? row.orgId;
}

function mapAppError(error: unknown): never {
  if (error instanceof AppNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  }
  throw error;
}

export const notificationsRouter = t.router({
  list: permissionedProcedure({ resource: "notify", action: "list" })
    .input(ListNotificationsInputSchema.default({ limit: 50, offset: 0 }))
    .output(NotificationListOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listNotifications(requireEm(ctx), appContext(ctx), input);
      } catch (error) {
        return mapAppError(error);
      }
    }),

  unreadCount: permissionedProcedure({ resource: "notify", action: "unreadCount" })
    .output(z.object({ count: z.number().int().nonnegative() }))
    .query(async ({ ctx }) => ({ count: await unreadNotificationCount(requireEm(ctx), appContext(ctx)) })),

  markRead: permissionedProcedure({ resource: "notify", action: "markRead" })
    .input(IdInputSchema)
    .output(NotificationOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await markNotificationReadCommand(requireEm(ctx), appContext(ctx), input.id);
      } catch (error) {
        return mapAppError(error);
      }
    }),

  markAllRead: permissionedProcedure({ resource: "notify", action: "markAllRead" })
    .output(z.object({ count: z.number().int().nonnegative() }))
    .mutation(async ({ ctx }) => markAllNotificationsRead(requireEm(ctx), appContext(ctx))),

  mute: permissionedProcedure({ resource: "notify", action: "mute" })
    .input(MuteInputSchema)
    .output(MuteOutputSchema)
    .mutation(async ({ ctx, input }) => muteNotificationSubject(requireEm(ctx), appContext(ctx), input)),

  mutes: t.router({
    list: permissionedProcedure({ resource: "notify", action: "list" })
      .output(z.array(MuteOutputSchema))
      .query(async ({ ctx }) => listNotificationMutes(requireEm(ctx), appContext(ctx))),
  }),

  unmute: permissionedProcedure({ resource: "notify", action: "unmute" })
    .input(SubjectInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => unmuteNotificationSubject(requireEm(ctx), appContext(ctx), input)),

  rules: t.router({
    list: permissionedProcedure({ resource: "notify", action: "list" })
      .output(z.array(NotificationRuleOutputSchema))
      .query(async ({ ctx }) => listNotificationRules(requireEm(ctx), appContext(ctx))),

    get: permissionedProcedure({ resource: "notify", action: "get" })
      .input(IdInputSchema)
      .output(NotificationRuleOutputSchema.nullable())
      .query(async ({ ctx, input }) => getNotificationRule(requireEm(ctx), appContext(ctx), input.id)),

    create: permissionedProcedure({ resource: "notify", action: "create" })
      .input(NotificationRuleCreateInputSchema)
      .output(NotificationRuleOutputSchema)
      .mutation(async ({ ctx, input }) => createNotificationRule(requireEm(ctx), appContext(ctx), input)),

    update: permissionedProcedure({ resource: "notify", action: "update" })
      .input(NotificationRuleUpdateInputSchema)
      .output(NotificationRuleOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await updateNotificationRule(requireEm(ctx), appContext(ctx), input);
        } catch (error) {
          return mapAppError(error);
        }
      }),

    delete: permissionedProcedure({ resource: "notify", action: "delete" })
      .input(IdInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => deleteNotificationRule(requireEm(ctx), appContext(ctx), input.id)),
  }),

  channels: t.router({
    list: permissionedProcedure({ resource: "notify", action: "list" })
      .output(z.array(z.object({
        name: ChannelNameSchema,
        enabled: z.boolean(),
        configurable: z.boolean(),
      })))
      .query(() => [...CHANNELS]),

    config: permissionedProcedure({ resource: "notify", action: "config" })
      .input(z.object({
        channel: ChannelNameSchema,
        enabled: z.boolean(),
        email: z.string().optional(),
        token: z.string().optional(),
        url: z.string().optional(),
        secret: z.string().optional(),
        subscription: z.string().optional(),
      }))
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        if (input.channel !== "push" || !input.subscription) return { ok: true };
        let parsed: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; userAgent?: string };
        try {
          parsed = JSON.parse(input.subscription) as typeof parsed;
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Push subscription must be JSON." });
        }
        if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys.auth) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Push subscription is incomplete." });
        }
        return upsertPushSubscription(requireEm(ctx), appContext(ctx), {
          endpoint: parsed.endpoint,
          keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
          userAgent: parsed.userAgent,
        });
      }),

    test: permissionedProcedure({ resource: "notify", action: "test" })
      .input(z.object({ channel: ChannelNameSchema }))
      .output(z.object({
        id: z.string().uuid(),
        channel: ChannelNameSchema,
        status: z.literal("pending"),
      }))
      .mutation(({ input }) => ({
        id: crypto.randomUUID(),
        channel: input.channel,
        status: "pending" as const,
      })),
  }),

  quietHours: t.router({
    get: permissionedProcedure({ resource: "notify", action: "get" })
      .output(QuietHoursOutputSchema.nullable())
      .query(async ({ ctx }) => getNotificationQuietHours(requireEm(ctx), appContext(ctx))),

    set: permissionedProcedure({ resource: "notify", action: "set" })
      .input(QuietHoursSetInputSchema)
      .output(QuietHoursOutputSchema)
      .mutation(async ({ ctx, input }) => setNotificationQuietHours(requireEm(ctx), appContext(ctx), input)),
  }),
});

export type NotificationsRouter = typeof notificationsRouter;
