import { error, fail, redirect } from "@sveltejs/kit";

import { createNotificationApiCaller } from "@notification-center/interface/http/notification-api-client.ts";

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

function createNotificationCaller(event: LoadEvent | RouteEvent): NotificationCaller | null {
  const { orgId, userId } = event.locals;
  if (!orgId || !userId) return null;

  return createNotificationApiCaller({
    baseUrl: process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${event.url.protocol}//${event.url.host}`,
    orgId,
    userId,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  }).notify;
}

function cookieHeaders(event: LoadEvent | RouteEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function requireSession(event: LoadEvent | RouteEvent): void {
  if (!event.locals.session) throw redirect(302, "/auth/login");
}

function requireNotificationCaller(event: LoadEvent | RouteEvent): NotificationCaller {
  const caller = createNotificationCaller(event);
  if (!caller) error(503, { message: "Notification API caller is not configured." });
  return caller;
}

function maskSecret(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 4)}***`;
}

function messageFromError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function configureChannel(
  event: RouteEvent,
  channel: "email" | "webhook" | "slack" | "discord" | "push",
  input: Record<string, unknown>,
): Promise<void> {
  const caller = createNotificationCaller(event);
  if (!caller) {
    throw new Error("Notification API caller is not configured.");
  }
  await caller.channels.config({ channel, enabled: true, ...input });
}

export async function load(event: LoadEvent) {
  requireSession(event);
  const caller = requireNotificationCaller(event);
  const [channels, rules, quietHours] = await Promise.all([
    caller.channels.list(),
    caller.rules.list(),
    caller.quietHours.get(),
  ]);
  return {
    channels: Array.isArray(channels) ? channels : [],
    rules: Array.isArray(rules) ? rules : [],
    quietHours: quietHours ?? null,
  };
}

export const actions = {
  saveEmail: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await configureChannel(event, "email", {
        email: String(form.get("email") ?? "").trim(),
        token: String(form.get("token") ?? "").trim(),
      });
      return { ok: true, emailVerified: Boolean(form.get("token")) };
    } catch (cause) {
      return fail(400, { channelError: messageFromError(cause) });
    }
  },

  saveWebhook: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    const secret = String(form.get("secret") ?? "").trim();
    try {
      await configureChannel(event, "webhook", {
        url: String(form.get("url") ?? "").trim(),
        secret,
      });
      return { ok: true, webhookSecretMasked: maskSecret(secret) };
    } catch (cause) {
      return fail(400, { channelError: messageFromError(cause) });
    }
  },

  saveSlack: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await configureChannel(event, "slack", {
        url: String(form.get("url") ?? "").trim(),
      });
      return { ok: true, channel: "slack" };
    } catch (cause) {
      return fail(400, { channelError: messageFromError(cause) });
    }
  },

  saveDiscord: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await configureChannel(event, "discord", {
        url: String(form.get("url") ?? "").trim(),
      });
      return { ok: true, channel: "discord" };
    } catch (cause) {
      return fail(400, { channelError: messageFromError(cause) });
    }
  },

  subscribePush: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await configureChannel(event, "push", {
        subscription: String(form.get("subscription") ?? "").trim(),
      });
      return { ok: true, channel: "push" };
    } catch (cause) {
      return fail(400, { channelError: messageFromError(cause) });
    }
  },
};
