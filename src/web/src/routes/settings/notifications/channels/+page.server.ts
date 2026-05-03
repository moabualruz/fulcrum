interface RouteEvent {
  locals: { session?: unknown };
  fetch: typeof fetch;
  request: {
    headers: { get(name: string): string | null };
    formData(): Promise<FormData>;
  };
  url: URL;
}

function fail(status: number, data: Record<string, unknown>) {
  return { status, ...data };
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

interface LoadEvent extends Omit<RouteEvent, "request"> {
  request: { headers: { get(name: string): string | null } };
}

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function cookieHeader(event: LoadEvent | RouteEvent): string {
  return event.request.headers.get("cookie") ?? "";
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

function extractTrpcError(body: unknown): string {
  const error = (body as { error?: { json?: { message?: string }; message?: string } })?.error;
  return error?.json?.message ?? error?.message ?? "Request failed";
}

async function trpcQuery(event: LoadEvent, procedure: string): Promise<unknown> {
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}?input=%7B%7D`, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(event),
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
      cookie: cookieHeader(event),
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

function requireSession(event: LoadEvent | RouteEvent): void {
  if (!event.locals.session) throw redirect(302, "/auth/login");
}

function maskSecret(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 4)}***`;
}

export async function load(event: LoadEvent) {
  requireSession(event);
  const channels = await trpcQuery(event, "notify.channels.list");
  return { channels: Array.isArray(channels) ? channels : [] };
}

export const actions = {
  saveEmail: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.channels.config", {
        channel: "email",
        enabled: true,
        email: String(form.get("email") ?? "").trim(),
        token: String(form.get("token") ?? "").trim(),
      });
      return { ok: true, emailVerified: Boolean(form.get("token")) };
    } catch (cause) {
      return fail(400, { channelError: String((cause as Error).message ?? cause) });
    }
  },

  saveWebhook: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    const secret = String(form.get("secret") ?? "").trim();
    try {
      await trpcMutation(event, "notify.channels.config", {
        channel: "webhook",
        enabled: true,
        url: String(form.get("url") ?? "").trim(),
        secret,
      });
      return { ok: true, webhookSecretMasked: maskSecret(secret) };
    } catch (cause) {
      return fail(400, { channelError: String((cause as Error).message ?? cause) });
    }
  },

  saveSlack: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.channels.config", {
        channel: "slack",
        enabled: true,
        url: String(form.get("url") ?? "").trim(),
      });
      return { ok: true, channel: "slack" };
    } catch (cause) {
      return fail(400, { channelError: String((cause as Error).message ?? cause) });
    }
  },

  saveDiscord: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.channels.config", {
        channel: "discord",
        enabled: true,
        url: String(form.get("url") ?? "").trim(),
      });
      return { ok: true, channel: "discord" };
    } catch (cause) {
      return fail(400, { channelError: String((cause as Error).message ?? cause) });
    }
  },

  subscribePush: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.channels.config", {
        channel: "push",
        enabled: true,
        subscription: String(form.get("subscription") ?? "").trim(),
      });
      return { ok: true, channel: "push" };
    } catch (cause) {
      return fail(400, { channelError: String((cause as Error).message ?? cause) });
    }
  },
};
