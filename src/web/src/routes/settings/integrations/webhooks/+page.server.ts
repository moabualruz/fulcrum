import { error, fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";

interface RouteEvent {
  locals: { session?: unknown };
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

function isNotifyWebhookEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("notify-webhook");
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

async function trpcQuery(event: LoadEvent, procedure: string): Promise<unknown> {
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}?input=%7B%7D`, {
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

  const [rules, channels] = await Promise.all([
    trpcQuery(loadEvent, "notify.rules.list"),
    trpcQuery(loadEvent, "notify.channels.list"),
  ]);
  return {
    subscriptions: Array.isArray(rules)
      ? rules.filter((rule) => Array.isArray(rule.channels) && rule.channels.includes("webhook"))
      : [],
    deliveries: [],
    channels: Array.isArray(channels) ? channels : [],
  };
};

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
};
