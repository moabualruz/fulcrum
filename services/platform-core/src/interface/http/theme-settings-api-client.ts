export interface ThemeSettingsApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface ThemeSettingsApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createThemeSettingsApiCaller(options: ThemeSettingsApiClientOptions) {
  const request = themeSettingsRequest(options);
  return {
    theme: {
      get: async () =>
        await request("/api/v1/settings/theme", { method: "GET", query: themeScopeQuery(options) }),
      update: async (input: JsonRecord) =>
        await request("/api/v1/settings/theme", { method: "PATCH", body: themeBody(options, input) }),
      listThemes: async () =>
        await request("/api/v1/settings/theme/tokens", { method: "GET", query: themeScopeQuery(options) }),
      getTheme: async (input: { key: string }) =>
        await request(`/api/v1/settings/theme/tokens/${encodeURIComponent(normalizeThemeKey(input.key))}`, {
          method: "GET",
          query: themeScopeQuery(options),
        }),
      setTheme: async (input: { key: string; value: string }) =>
        await request(`/api/v1/settings/theme/tokens/${encodeURIComponent(normalizeThemeKey(input.key))}`, {
          method: "PUT",
          body: themeBody(options, { value: input.value }),
        }),
    },
  };
}

export function createThemeSettingsApiCallerFromEnv(
  env: ThemeSettingsApiEnvironment = process.env as unknown as ThemeSettingsApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createThemeSettingsApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function themeSettingsRequest(options: ThemeSettingsApiClientOptions) {
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

function themeScopeQuery(options: ThemeSettingsApiClientOptions): JsonRecord {
  return { orgId: options.orgId, userId: options.userId };
}

function themeBody(options: ThemeSettingsApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function normalizeThemeKey(value: string): string {
  return value.startsWith("theme.") ? value : `theme.${value}`;
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Theme settings API request failed with ${status}.`;
}
