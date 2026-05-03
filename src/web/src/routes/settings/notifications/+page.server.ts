type FetchFn = typeof fetch;

interface RouteEvent {
  locals: { session?: unknown };
  fetch: FetchFn;
  request: {
    headers: { get(name: string): string | null };
    formData(): Promise<FormData>;
  };
  url: URL;
}

interface LoadEvent extends Omit<RouteEvent, "request"> {
  request: { headers: { get(name: string): string | null } };
}

const CHANNELS = ["in-app", "email", "slack", "discord", "webhook", "push"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6];

function fail(status: number, data: Record<string, unknown>) {
  return { status, ...data };
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
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

async function trpcQuery(event: LoadEvent | RouteEvent, procedure: string): Promise<unknown> {
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

async function trpcMutation(
  event: RouteEvent,
  procedure: string,
  input: unknown,
): Promise<unknown> {
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

function selectedValues(form: FormData, key: string): string[] {
  return form.getAll(key).map(String).filter(Boolean);
}

function selectedChannels(form: FormData): string[] {
  return Array.from(new Set(["in-app", ...selectedValues(form, "channels")]))
    .filter((channel) => CHANNELS.includes(channel as (typeof CHANNELS)[number]));
}

function buildEventPattern(form: FormData): Record<string, unknown> {
  const subjectKind = String(form.get("subjectKind") ?? "").trim();
  const verb = String(form.get("verb") ?? "").trim();
  const payloadPath = String(form.get("payloadPath") ?? "").trim();
  const payloadValue = String(form.get("payloadValue") ?? "").trim();
  const eventPattern: Record<string, unknown> = {};

  if (subjectKind) eventPattern["subject_kind"] = subjectKind;
  if (verb) eventPattern["verb"] = verb;
  if (payloadPath && payloadValue) {
    eventPattern["payload_path_eq"] = [{ path: payloadPath, value: payloadValue }];
  }

  return eventPattern;
}

function parseHour(value: FormDataEntryValue | null, fallback: number): number {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function isActiveNow(quietHours: any, now = new Date()): boolean {
  if (!quietHours) return false;
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const days = Array.isArray(quietHours.daysOfWeek) ? quietHours.daysOfWeek.map(Number) : DAYS;
  if (!days.includes(day)) return false;
  const start = Number(quietHours.startHour);
  const end = Number(quietHours.endHour);
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export async function load(event: LoadEvent) {
  requireSession(event);
  const [rules, quietHours, channels, mutes] = await Promise.all([
    trpcQuery(event, "notify.rules.list"),
    trpcQuery(event, "notify.quietHours.get"),
    trpcQuery(event, "notify.channels.list"),
    trpcQuery(event, "notify.mutes.list"),
  ]);

  return {
    rules: Array.isArray(rules) ? rules : [],
    quietHours,
    quietHoursActiveNow: isActiveNow(quietHours),
    channels: Array.isArray(channels) ? channels : [],
    mutes: Array.isArray(mutes) ? mutes : [],
  };
}

export const actions = {
  createRule: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();
    const subjectKind = String(form.get("subjectKind") ?? "").trim();
    if (!name || !subjectKind) return fail(400, { createError: "Name and kind are required." });

    try {
      await trpcMutation(event, "notify.rules.create", {
        name,
        subjectKind,
        eventPattern: buildEventPattern(form),
        channels: selectedChannels(form),
        enabled: true,
      });
      return { ok: true, action: "createRule" };
    } catch (cause) {
      return fail(400, { createError: String((cause as Error).message ?? cause) });
    }
  },

  toggleRule: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.rules.update", {
        id: String(form.get("id") ?? ""),
        enabled: String(form.get("enabled") ?? "") === "true",
      });
      return { ok: true, action: "toggleRule" };
    } catch (cause) {
      return fail(400, { ruleError: String((cause as Error).message ?? cause) });
    }
  },

  deleteRule: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.rules.delete", { id: String(form.get("id") ?? "") });
      return { ok: true, action: "deleteRule" };
    } catch (cause) {
      return fail(400, { ruleError: String((cause as Error).message ?? cause) });
    }
  },

  saveQuietHours: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.quietHours.set", {
        tz: String(form.get("tz") ?? "UTC").trim() || "UTC",
        startHour: parseHour(form.get("startHour"), 22),
        endHour: parseHour(form.get("endHour"), 7),
        daysOfWeek: selectedValues(form, "daysOfWeek").map(Number),
      });
      return { ok: true, action: "saveQuietHours" };
    } catch (cause) {
      return fail(400, { quietHoursError: String((cause as Error).message ?? cause) });
    }
  },

  addMute: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    const mutedUntil = String(form.get("mutedUntil") ?? "").trim();
    try {
      await trpcMutation(event, "notify.mute", {
        subjectKind: String(form.get("subjectKind") ?? "").trim(),
        subjectId: String(form.get("subjectId") ?? "").trim(),
        mutedUntil: mutedUntil ? new Date(mutedUntil) : null,
      });
      return { ok: true, action: "addMute" };
    } catch (cause) {
      return fail(400, { muteError: String((cause as Error).message ?? cause) });
    }
  },

  removeMute: async (event: RouteEvent) => {
    requireSession(event);
    const form = await event.request.formData();
    try {
      await trpcMutation(event, "notify.unmute", {
        subjectKind: String(form.get("subjectKind") ?? "").trim(),
        subjectId: String(form.get("subjectId") ?? "").trim(),
      });
      return { ok: true, action: "removeMute" };
    } catch (cause) {
      return fail(400, { muteError: String((cause as Error).message ?? cause) });
    }
  },
};
