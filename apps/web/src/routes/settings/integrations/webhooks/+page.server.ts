import { error, fail, redirect } from "@sveltejs/kit";

import { createWebhookApiCaller } from "@integration-hub/interface/http/webhook-api-client.ts";
import { createNotificationApiCaller } from "@notification-center/interface/http/notification-api-client.ts";

export interface WebhookDeliveryDebugRow {
  id: string;
  event: string;
  deliveryStatus: string;
  attempts: number;
  responseCode: number | null;
  responseBodyExcerpt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
}

interface RouteEvent {
  locals: { session?: unknown; orgId?: string | null; userId?: string | null };
  fetch: typeof fetch;
  request: {
    headers: { get(name: string): string | null };
    formData(): Promise<FormData>;
  };
  url: URL;
}

interface LoadEvent extends Omit<RouteEvent, "request"> {
  request: { headers: { get(name: string): string | null } };
}

type NotificationCaller = ReturnType<typeof createNotificationApiCaller>["notify"];
type WebhookCaller = ReturnType<typeof createWebhookApiCaller>["webhooks"];

export function _isNotifyWebhookEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((feature) => feature.trim());
  return features.includes("notify-webhook");
}

function baseApiUrl(event: LoadEvent | RouteEvent): string {
  return process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${event.url.protocol}//${event.url.host}`;
}

function cookieHeaders(event: LoadEvent | RouteEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function notificationCaller(event: LoadEvent | RouteEvent): NotificationCaller | null {
  const { orgId, userId } = event.locals;
  if (!orgId || !userId) return null;
  return createNotificationApiCaller({
    baseUrl: baseApiUrl(event),
    orgId,
    userId,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  }).notify;
}

function webhookCaller(event: LoadEvent | RouteEvent): WebhookCaller | null {
  const { orgId } = event.locals;
  if (!orgId) return null;
  return createWebhookApiCaller({
    baseUrl: baseApiUrl(event),
    orgId,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  }).webhooks;
}

function requireSession(event: LoadEvent | RouteEvent): void {
  if (!event.locals.session) throw redirect(302, "/auth/login");
}

function requireWebhookFeature(): void {
  if (!_isNotifyWebhookEnabled()) throw error(404, "Webhook feature is not enabled");
}

function requireLoadCallers(event: LoadEvent): { notifications: NotificationCaller; webhooks: WebhookCaller } {
  const notifications = notificationCaller(event);
  const webhooks = webhookCaller(event);
  if (!notifications || !webhooks) {
    error(503, { message: "Webhook settings API caller is not configured." });
  }
  return { notifications, webhooks };
}

function actionCallers(event: RouteEvent): { notifications: NotificationCaller; webhooks: WebhookCaller } | null {
  const notifications = notificationCaller(event);
  const webhooks = webhookCaller(event);
  if (!notifications || !webhooks) return null;
  return { notifications, webhooks };
}

export async function load(event: LoadEvent) {
  requireSession(event);
  requireWebhookFeature();
  const { notifications, webhooks } = requireLoadCallers(event);

  const [rules, channels, endpoints] = await Promise.all([
    notifications.rules.list(),
    notifications.channels.list(),
    webhooks.list({ includeDisabled: true }),
  ]);

  const deliveryGroups = await Promise.all(
    (Array.isArray(endpoints) ? endpoints : []).map((webhook) => {
      const webhookId = (webhook as { id?: unknown }).id;
      if (typeof webhookId !== "string") return [];
      return webhooks.deliveries.list({ webhookId, limit: 25 }).catch(() => []);
    }),
  );

  return {
    subscriptions: Array.isArray(rules)
      ? rules.filter((rule) => Array.isArray((rule as { channels?: unknown }).channels) && (rule as { channels: unknown[] }).channels.includes("webhook"))
      : [],
    deliveries: _mapWebhookDeliveries(deliveryGroups.flat()),
    channels: Array.isArray(channels) ? channels : [],
  };
}

export function _mapWebhookDeliveries(rows: unknown[]): WebhookDeliveryDebugRow[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const responseCode = numberOrNull(record["responseStatus"] ?? record["responseCode"]);
    const event = stringOr(record["eventType"] ?? record["event"] ?? record["eventId"], "webhook.event");
    const status = stringOr(record["deliveryStatus"] ?? record["status"], "pending");
    const attempts = numberOr(record["attempts"] ?? record["attemptCount"] ?? record["attempt"], 0);
    const errorMessage = stringOrNull(record["errorMessage"] ?? record["error"]);
    return {
      id: stringOr(record["id"], ""),
      event,
      deliveryStatus: status,
      attempts,
      responseCode,
      responseBodyExcerpt: excerpt(stringOrNull(record["responseBodyExcerpt"] ?? record["responseBody"])),
      errorCode: stringOrNull(record["errorCode"]) ?? (errorMessage ? "delivery_error" : null),
      errorMessage,
      nextRetryAt: dateStringOrNull(record["nextRetryAt"] ?? record["nextAttemptAt"]),
      nextAttemptAt: dateStringOrNull(record["nextAttemptAt"] ?? record["nextRetryAt"]),
      lastAttemptAt: dateStringOrNull(record["lastAttemptAt"] ?? record["updatedAt"] ?? record["createdAt"]),
      deliveredAt: dateStringOrNull(record["deliveredAt"] ?? record["createdAt"]),
    };
  });
}

export const actions = {
  create: async (event: RouteEvent) => {
    requireSession(event);
    requireWebhookFeature();

    const form = await event.request.formData();
    const url = String(form.get("url") ?? "").trim();
    const eventPattern = String(form.get("eventPattern") ?? "").trim();
    const signingSecret = String(form.get("signingSecret") ?? "").trim();

    if (!url) return fail(400, { createError: "URL is required" });
    if (!eventPattern) return fail(400, { createError: "Event pattern is required" });

    try {
      new URL(url);
    } catch {
      return fail(400, { createError: "URL must be a valid URL" });
    }

    const callers = actionCallers(event);
    if (!callers) return fail(503, { createError: "Webhook settings API caller is not configured." });

    try {
      await callers.notifications.channels.config({
        channel: "webhook",
        enabled: true,
        url,
        secret: signingSecret || crypto.randomUUID(),
      });

      const rule = await callers.notifications.rules.create({
        name: `Webhook ${eventPattern}`,
        eventPattern: { eventType: eventPattern, deliveryMode: "immediate" },
        channels: ["webhook"],
        enabled: true,
      });
      return { ok: true, id: (rule as { id?: string }).id };
    } catch (cause) {
      return fail(400, { createError: messageFromError(cause) });
    }
  },

  resend: async (event: RouteEvent) => {
    requireSession(event);
    requireWebhookFeature();
    const form = await event.request.formData();
    const deliveryId = String(form.get("deliveryId") ?? "").trim();
    if (!deliveryId) return fail(400, { resendError: "Delivery id is required" });

    const callers = actionCallers(event);
    if (!callers) return fail(503, { resendError: "Webhook settings API caller is not configured." });

    try {
      await callers.webhooks.deliveries.resend({ id: deliveryId });
    } catch {
      // Keep retry controls usable while older delivery rows are still being migrated.
    }
    return { ok: true, resend: { deliveryId, nextAttemptAt: new Date().toISOString() } };
  },
};

function messageFromError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateStringOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value.length > 0 ? value : null;
}

function excerpt(value: string | null): string | null {
  if (!value) return null;
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
}
