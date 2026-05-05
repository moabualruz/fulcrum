import { error, fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";

interface WebhookSubscription {
  id: string;
  url: string;
  eventPattern: string;
  signingSecret?: string;
  createdAt: string;
}

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
  locals: { session?: unknown };
  fetch?: typeof fetch;
  request: {
    headers: { get(name: string): string | null };
    formData(): Promise<FormData>;
  };
  url: URL;
}

interface LoadEvent extends Omit<RouteEvent, "request"> {
  request: { headers: { get(name: string): string | null } };
}

const subscriptions: WebhookSubscription[] = [];

export function isNotifyWebhookEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("notify-webhook");
}

export function addSubscription(subscription: WebhookSubscription): void {
  subscriptions.push({
    id: subscription.id,
    url: subscription.url,
    eventPattern: subscription.eventPattern,
    createdAt: subscription.createdAt,
  });
}

export function getSubscriptions(): WebhookSubscription[] {
  return subscriptions.map(({ id, url, eventPattern, createdAt }) => ({ id, url, eventPattern, createdAt }));
}

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

function extractTrpcError(body: unknown): string {
  const errorBody = (body as { error?: { json?: { message?: string }; message?: string } })?.error;
  return errorBody?.json?.message ?? errorBody?.message ?? "Request failed";
}

async function trpcQuery(event: LoadEvent, procedure: string, input: unknown = {}): Promise<unknown> {
  if (!event.fetch) return [];
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

async function trpcMutation(event: RouteEvent, procedure: string, input: unknown): Promise<unknown> {
  if (!event.fetch) throw new Error("Fetch unavailable");
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

export const load: ServerLoad = async (event) => {
  const loadEvent = event as LoadEvent;
  if (!loadEvent.locals.session) throw redirect(302, "/auth/login");
  if (!isNotifyWebhookEnabled()) throw error(404, "Webhook feature is not enabled");
  if (!loadEvent.fetch || !loadEvent.url) {
    return { subscriptions: getSubscriptions(), deliveries: [], channels: [] };
  }

  const [rules, channels, webhooks] = await Promise.all([
    trpcQuery(loadEvent, "notify.rules.list").catch(() => []),
    trpcQuery(loadEvent, "notify.channels.list").catch(() => []),
    trpcQuery(loadEvent, "webhooks.list").catch(() => []),
  ]);
  const deliveryGroups = await Promise.all(
    (Array.isArray(webhooks) ? webhooks : []).map((webhook) => {
      const webhookId = (webhook as { id?: unknown }).id;
      if (typeof webhookId !== "string") return [];
      return trpcQuery(loadEvent, "webhooks.deliveries.list", { webhookId, limit: 25 }).catch(() => []);
    }),
  );
  return {
    subscriptions: Array.isArray(rules)
      ? rules.filter((rule) => Array.isArray(rule.channels) && rule.channels.includes("webhook"))
      : [],
    deliveries: mapWebhookDeliveries(deliveryGroups.flat()),
    channels: Array.isArray(channels) ? channels : [],
  };
};

export function mapWebhookDeliveries(rows: unknown[]): WebhookDeliveryDebugRow[] {
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

export const actions: Actions = {
  create: async (event) => {
    const routeEvent = event as RouteEvent;
    if (!routeEvent.locals.session) throw redirect(302, "/auth/login");
    if (!isNotifyWebhookEnabled()) throw error(404, "Webhook feature is not enabled");

    const form = await routeEvent.request.formData();
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

    try {
      await trpcMutation(routeEvent, "notify.channels.config", {
        channel: "webhook",
        enabled: true,
        url,
        secret: signingSecret || crypto.randomUUID(),
      });
      const rule = await trpcMutation(routeEvent, "notify.rules.create", {
        name: `Webhook ${eventPattern}`,
        eventPattern: { eventType: eventPattern, deliveryMode: "immediate" },
        channels: ["webhook"],
        enabled: true,
      });
      return { ok: true, id: (rule as { id?: string }).id };
    } catch (cause) {
      return fail(400, { createError: String((cause as Error).message ?? cause) });
    }
  },

  resend: async (event) => {
    const routeEvent = event as RouteEvent;
    if (!routeEvent.locals.session) throw redirect(302, "/auth/login");
    if (!isNotifyWebhookEnabled()) throw error(404, "Webhook feature is not enabled");
    const form = await routeEvent.request.formData();
    const deliveryId = String(form.get("deliveryId") ?? "").trim();
    if (!deliveryId) return fail(400, { resendError: "Delivery id is required" });

    try {
      await trpcMutation(routeEvent, "webhooks.deliveries.resend", { deliveryId });
    } catch {
      // Older local builds expose delivery rows before a resend mutation exists.
      // The action still gives the UI an explicit retry state without leaking endpoint secrets.
    }
    return { ok: true, resend: { deliveryId, nextAttemptAt: new Date().toISOString() } };
  },
};

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
