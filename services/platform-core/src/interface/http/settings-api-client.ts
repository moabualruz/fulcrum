export interface SettingsApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface SettingsApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createSettingsApiCaller(options: SettingsApiClientOptions) {
  const request = settingsRequest(options);
  return {
    settings: {
      list: async () =>
        await request("/api/v1/settings", { method: "GET", query: settingsScopeQuery(options) }),
      get: async (input: { key: string }) =>
        await request(`/api/v1/settings/${encodeURIComponent(input.key)}`, {
          method: "GET",
          query: settingsScopeQuery(options),
        }),
      set: async (input: { key: string; value: string }) =>
        await request(`/api/v1/settings/${encodeURIComponent(input.key)}`, {
          method: "PUT",
          body: settingsBody(options, input),
        }),
    },
  };
}

export function createSettingsApiCallerFromEnv(
  env: SettingsApiEnvironment = process.env as unknown as SettingsApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createSettingsApiCaller({ baseUrl, orgId, userId: env.FULCRUM_USER_ID, fetch: fetchFn });
}

function settingsRequest(options: SettingsApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(compact(init.query ?? {}))) {
      url.searchParams.set(key, String(value));
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
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function settingsScopeQuery(options: SettingsApiClientOptions): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
  });
}

function settingsBody(options: SettingsApiClientOptions, input: { value: string }): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    value: input.value,
  });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Settings API request failed with ${status}.`;
}
