import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";
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

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
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

function requireEm(ctx: AuthCtx): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return ctx.em;
}

async function entities() {
  return import("../../db/entities/notifications/index.ts");
}

async function orgClass() {
  return (await import("../../db/entities/auth/Org.ts")).Org;
}

function notificationToOutput(row: any) {
  return {
    id: row.id,
    orgId: row.org?.id ?? row.org,
    userId: row.userId,
    ruleId: row.ruleId ?? null,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    entityKind: row.entityKind,
    entityId: row.entityId,
    read: row.readAt !== null,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
  };
}

function ruleToOutput(row: any) {
  const timing = ruleTiming(row.eventPattern ?? {});
  return {
    id: row.id,
    orgId: row.org?.id ?? row.org,
    userId: row.userId,
    name: row.name ?? "",
    subjectKind: row.subjectKind ?? null,
    active: row.active,
    eventPattern: row.eventPattern ?? {},
    channels: row.channels ?? [],
    enabled: row.enabled,
    deliveryMode: timing.deliveryMode,
    digestWindowSeconds: timing.digestWindowSeconds,
    delaySeconds: timing.delaySeconds,
    critical: timing.critical,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

function muteToOutput(row: any) {
  return {
    id: row.id,
    orgId: row.org?.id ?? row.org,
    userId: row.userId,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    mutedUntil: row.mutedUntil ?? null,
  };
}

function quietHoursToOutput(row: any) {
  return {
    id: row.id,
    orgId: row.org?.id ?? row.org,
    userId: row.userId,
    tz: row.tz,
    startHour: row.startHour,
    endHour: row.endHour,
    daysOfWeek: (row.daysOfWeek ?? []).map(Number),
  };
}

async function findOrgRef(em: EntityManager, orgId: string) {
  const Org = await orgClass();
  return em.findOneOrFail(Org, { id: orgId });
}

function notificationOrgId(row: NotificationCountRow): string | undefined {
  return typeof row.org === "object" ? row.org.id : row.org ?? row.orgId;
}

function ruleTiming(pattern: Record<string, unknown>) {
  const deliveryMode = DeliveryModeSchema.catch("immediate").parse(pattern["deliveryMode"]);
  return {
    deliveryMode,
    digestWindowSeconds: typeof pattern["digestWindowSeconds"] === "number" ? pattern["digestWindowSeconds"] : null,
    delaySeconds: typeof pattern["delaySeconds"] === "number" ? pattern["delaySeconds"] : null,
    critical: pattern["critical"] === true,
  };
}

function withRuleTiming(
  pattern: Record<string, unknown>,
  input: {
    deliveryMode?: "immediate" | "digest" | "delayed";
    digestWindowSeconds?: number | null;
    delaySeconds?: number | null;
    critical?: boolean;
  },
): Record<string, unknown> {
  const next = { ...pattern };
  if (input.deliveryMode !== undefined) next["deliveryMode"] = input.deliveryMode;
  if (input.digestWindowSeconds !== undefined) {
    if (input.digestWindowSeconds === null) delete next["digestWindowSeconds"];
    else next["digestWindowSeconds"] = input.digestWindowSeconds;
  }
  if (input.delaySeconds !== undefined) {
    if (input.delaySeconds === null) delete next["delaySeconds"];
    else next["delaySeconds"] = input.delaySeconds;
  }
  if (input.critical !== undefined) next["critical"] = input.critical;
  if (next["deliveryMode"] === "digest" && next["digestWindowSeconds"] === undefined) next["digestWindowSeconds"] = 300;
  return next;
}

export const notificationsRouter = t.router({
  list: permissionedProcedure({ resource: "notify", action: "list" })
    .input(ListNotificationsInputSchema.default({ limit: 50, offset: 0 }))
    .output(NotificationListOutputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const { Notification } = await entities();
      const where: Record<string, unknown> = {
        org: ctx.orgId,
        userId: ctx.userId,
      };
      if (input.unread) where["readAt"] = null;

      const [items, total] = await em.findAndCount(Notification, where as any, {
        limit: input.limit,
        offset: input.offset,
        orderBy: { createdAt: "DESC" } as any,
      });

      return { items: items.map(notificationToOutput), total };
    }),

  unreadCount: permissionedProcedure({ resource: "notify", action: "unreadCount" })
    .output(z.object({ count: z.number().int().nonnegative() }))
    .query(async ({ ctx }) => {
      const em = requireEm(ctx);
      const { Notification } = await entities();
      const count = await em.count(Notification, {
        org: ctx.orgId,
        userId: ctx.userId,
        readAt: null,
      } as any);
      return { count };
    }),

  markRead: permissionedProcedure({ resource: "notify", action: "markRead" })
    .input(IdInputSchema)
    .output(NotificationOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const { Notification } = await entities();
      const row = await em.findOne(Notification, {
        id: input.id,
        org: ctx.orgId,
        userId: ctx.userId,
      } as any);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." });
      }
      markNotificationRead(row as any);
      await em.flush();
      return notificationToOutput(row);
    }),

  markAllRead: permissionedProcedure({ resource: "notify", action: "markAllRead" })
    .output(z.object({ count: z.number().int().nonnegative() }))
    .mutation(async ({ ctx }) => {
      const em = requireEm(ctx);
      const { Notification } = await entities();
      const rows = await em.find(Notification, {
        org: ctx.orgId,
        userId: ctx.userId,
        readAt: null,
      } as any);
      const now = new Date();
      for (const row of rows) (row as any).readAt = now;
      await em.flush();
      return { count: rows.length };
    }),

  mute: permissionedProcedure({ resource: "notify", action: "mute" })
    .input(MuteInputSchema)
    .output(MuteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const { NotificationMute } = await entities();
      const existing = await em.findOne(NotificationMute, {
        org: ctx.orgId,
        userId: ctx.userId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
      } as any);
      const row = existing ?? em.create(NotificationMute, {
        org: await findOrgRef(em, ctx.orgId),
        userId: ctx.userId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
      } as any);
      (row as any).mutedUntil = input.mutedUntil ?? null;
      em.persist(row);
      await em.flush();
      return muteToOutput(row);
    }),

  mutes: t.router({
    list: permissionedProcedure({ resource: "notify", action: "list" })
      .output(z.array(MuteOutputSchema))
      .query(async ({ ctx }) => {
        const em = requireEm(ctx);
        const { NotificationMute } = await entities();
        const rows = await em.find(NotificationMute, {
          org: ctx.orgId,
          userId: ctx.userId,
        } as any, { orderBy: { subjectKind: "ASC" } as any });
        return rows.map(muteToOutput);
      }),
  }),

  unmute: permissionedProcedure({ resource: "notify", action: "unmute" })
    .input(SubjectInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const { NotificationMute } = await entities();
      const row = await em.findOne(NotificationMute, {
        org: ctx.orgId,
        userId: ctx.userId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
      } as any);
      if (row) em.remove(row);
      await em.flush();
      return { ok: true };
    }),

  rules: t.router({
    list: permissionedProcedure({ resource: "notify", action: "list" })
      .output(z.array(NotificationRuleOutputSchema))
      .query(async ({ ctx }) => {
        const em = requireEm(ctx);
        const { NotificationRule } = await entities();
        const rows = await em.find(NotificationRule, {
          org: ctx.orgId,
          userId: ctx.userId,
        } as any, { orderBy: { name: "ASC" } as any });
        return rows.map(ruleToOutput);
      }),

    get: permissionedProcedure({ resource: "notify", action: "get" })
      .input(IdInputSchema)
      .output(NotificationRuleOutputSchema.nullable())
      .query(async ({ ctx, input }) => {
        const em = requireEm(ctx);
        const { NotificationRule } = await entities();
        const row = await em.findOne(NotificationRule, {
          id: input.id,
          org: ctx.orgId,
          userId: ctx.userId,
        } as any);
        return row ? ruleToOutput(row) : null;
      }),

    create: permissionedProcedure({ resource: "notify", action: "create" })
      .input(NotificationRuleCreateInputSchema)
      .output(NotificationRuleOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEm(ctx);
        const { NotificationRule } = await entities();
        const now = new Date();
      const eventPattern = withRuleTiming(input.eventPattern, input);
      const row = em.create(NotificationRule, {
          org: await findOrgRef(em, ctx.orgId),
          userId: ctx.userId,
          name: input.name,
          subjectKind: input.subjectKind ?? null,
          active: input.enabled,
          eventPattern,
          channels: input.channels,
          enabled: input.enabled,
          createdAt: now,
          updatedAt: now,
        } as any);
        em.persist(row);
        await em.flush();
        return ruleToOutput(row);
      }),

    update: permissionedProcedure({ resource: "notify", action: "update" })
      .input(NotificationRuleUpdateInputSchema)
      .output(NotificationRuleOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEm(ctx);
        const { NotificationRule } = await entities();
        const row = await em.findOne(NotificationRule, {
          id: input.id,
          org: ctx.orgId,
          userId: ctx.userId,
        } as any);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Notification rule not found." });
        }
        if (input.name !== undefined) (row as any).name = input.name;
        if (input.subjectKind !== undefined) (row as any).subjectKind = input.subjectKind;
        if (input.eventPattern !== undefined) (row as any).eventPattern = input.eventPattern;
        if (
          input.deliveryMode !== undefined ||
          input.digestWindowSeconds !== undefined ||
          input.delaySeconds !== undefined ||
          input.critical !== undefined
        ) {
          (row as any).eventPattern = withRuleTiming((row as any).eventPattern ?? {}, input);
        }
        if (input.channels !== undefined) (row as any).channels = input.channels;
        if (input.enabled !== undefined) {
          (row as any).enabled = input.enabled;
          (row as any).active = input.enabled;
        }
        (row as any).updatedAt = new Date();
        await em.flush();
        return ruleToOutput(row);
      }),

    delete: permissionedProcedure({ resource: "notify", action: "delete" })
      .input(IdInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const em = requireEm(ctx);
        const { NotificationRule } = await entities();
        const row = await em.findOne(NotificationRule, {
          id: input.id,
          org: ctx.orgId,
          userId: ctx.userId,
        } as any);
        if (row) em.remove(row);
        await em.flush();
        return { ok: true };
      }),
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

        const em = requireEm(ctx);
        const { PushSubscription } = await entities();
        let parsed: {
          endpoint?: string;
          keys?: { p256dh?: string; auth?: string };
          userAgent?: string;
        };
        try {
          parsed = JSON.parse(input.subscription) as typeof parsed;
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Push subscription must be JSON." });
        }
        if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys.auth) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Push subscription is incomplete." });
        }
        const existing = await em.findOne(PushSubscription, {
          org: ctx.orgId,
          userId: ctx.userId,
          endpoint: parsed.endpoint,
        } as any);
        const row = existing ?? em.create(PushSubscription, {
          org: await findOrgRef(em, ctx.orgId),
          userId: ctx.userId,
          endpoint: parsed.endpoint,
        } as any);
        (row as any).p256dh = parsed.keys.p256dh;
        (row as any).auth = parsed.keys.auth;
        (row as any).userAgent = parsed.userAgent ?? null;
        em.persist(row);
        await em.flush();
        return { ok: true };
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
      .query(async ({ ctx }) => {
        const em = requireEm(ctx);
        const { NotificationQuietHours } = await entities();
        const row = await em.findOne(NotificationQuietHours, {
          org: ctx.orgId,
          userId: ctx.userId,
        } as any);
        return row ? quietHoursToOutput(row) : null;
      }),

    set: permissionedProcedure({ resource: "notify", action: "set" })
      .input(QuietHoursSetInputSchema)
      .output(QuietHoursOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEm(ctx);
        const { NotificationQuietHours } = await entities();
        const row = await em.findOne(NotificationQuietHours, {
          org: ctx.orgId,
          userId: ctx.userId,
        } as any) ?? em.create(NotificationQuietHours, {
          org: await findOrgRef(em, ctx.orgId),
          userId: ctx.userId,
        } as any);
        (row as any).tz = input.tz;
        (row as any).startHour = input.startHour;
        (row as any).endHour = input.endHour;
        (row as any).daysOfWeek = input.daysOfWeek;
        em.persist(row);
        await em.flush();
        return quietHoursToOutput(row);
      }),
  }),
});

export type NotificationsRouter = typeof notificationsRouter;
