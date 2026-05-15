export interface NotificationApiCallerOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface NotificationApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

type NotificationSubjectInput =
  | { subjectKind: string; subjectId: string; mutedUntil?: Date | string | null }
  | { sourceKind: string; sourceId: string; mutedUntil?: Date | string | null };

type JsonRecord = Record<string, unknown>;

export function createNotificationApiCaller(options: NotificationApiCallerOptions) {
  const request = notificationRequest(options);

  return {
    notify: {
      unreadCount: async () => await request<{ count: number }>("/api/v1/notifications/unread-count"),
      list: async (input: { unread?: boolean; limit?: number; offset?: number } = {}) => {
        const body = await request<{ data?: unknown[] }>("/api/v1/notifications", { query: input });
        return Array.isArray(body.data) ? body.data : body;
      },
      markRead: async (input: { id: string }) => {
        await request(`/api/v1/notifications/${encodeURIComponent(input.id)}/mark-read`, { method: "PATCH" });
        return { ok: true, id: input.id };
      },
      markAllRead: async () => await request<{ count: number }>("/api/v1/notifications/mark-all-read", { method: "PATCH" }),
      mute: async (input: NotificationSubjectInput) =>
        await request("/api/v1/notifications/mutes", { method: "POST", body: normalizeSubjectInput(input) }),
      unmute: async (input: NotificationSubjectInput) => {
        const subject = normalizeSubjectInput(input);
        return await request<{ ok: true }>(
          `/api/v1/notifications/mutes/${encodeURIComponent(subject.subjectKind)}/${encodeURIComponent(subject.subjectId)}`,
          { method: "DELETE" },
        );
      },
      mutes: {
        list: async () => await request<unknown[]>("/api/v1/notifications/mutes"),
      },
      rules: {
        list: async () => await request<unknown[]>("/api/v1/notifications/rules"),
        get: async (input: { id: string }) =>
          await request(`/api/v1/notifications/rules/${encodeURIComponent(input.id)}`),
        create: async (input: JsonRecord) =>
          await request("/api/v1/notifications/rules", { method: "POST", body: input }),
        update: async (input: JsonRecord & { id: string }) => {
          const { id, ...body } = input;
          return await request(`/api/v1/notifications/rules/${encodeURIComponent(id)}`, { method: "PATCH", body });
        },
        delete: async (input: { id: string }) =>
          await request<{ ok: true }>(`/api/v1/notifications/rules/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
      },
      channels: {
        list: async () => {
          const settings = await request<{ channels?: unknown[] }>("/api/v1/notifications/settings");
          return Array.isArray(settings.channels) ? settings.channels : [];
        },
        config: async (input: JsonRecord) => {
          const channel = notificationChannel(input);
          return await request(`/api/v1/notifications/channels/${encodeURIComponent(channel)}`, {
            method: "PATCH",
            body: { ...input, channel: undefined, kind: undefined },
          });
        },
        test: async (input: { channel?: string; kind?: string }) => {
          const channel = notificationChannel(input);
          return await request(`/api/v1/notifications/channels/${encodeURIComponent(channel)}/test`, { method: "POST" });
        },
      },
      quietHours: {
        get: async () => await request("/api/v1/notifications/quiet-hours"),
        set: async (input: JsonRecord) =>
          await request("/api/v1/notifications/quiet-hours", { method: "PATCH", body: input }),
      },
    },
  };
}

export function createNotificationApiCallerFromEnv(
  env: NotificationApiEnvironment = process.env as unknown as NotificationApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createNotificationApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function notificationRequest(options: NotificationApiCallerOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: Record<string, unknown>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    url.searchParams.set("orgId", options.orgId);
    url.searchParams.set("userId", options.userId);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function normalizeSubjectInput(input: NotificationSubjectInput): {
  subjectKind: string;
  subjectId: string;
  mutedUntil?: string | null;
} {
  const record = input as Record<string, unknown>;
  const subjectKind = String(record["subjectKind"] ?? record["sourceKind"] ?? "");
  const subjectId = String(record["subjectId"] ?? record["sourceId"] ?? "");
  const rawUntil = record["mutedUntil"];
  return {
    subjectKind,
    subjectId,
    mutedUntil: rawUntil instanceof Date ? rawUntil.toISOString() : rawUntil == null ? null : String(rawUntil),
  };
}

function notificationChannel(input: Record<string, unknown>): string {
  const channel = input["channel"] ?? input["kind"];
  if (typeof channel !== "string" || channel.length === 0) throw new Error("Notification channel is required.");
  return channel;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Notification API request failed with ${status}.`;
}
