export interface TelemetryApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface TelemetryApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createTelemetryApiCaller(options: TelemetryApiClientOptions) {
  const request = telemetryRequest(options);
  return {
    telemetry: {
      status: async () =>
        await request("/api/v1/telemetry/status", {
          query: scopedQuery(options),
        }),
      optIn: async () =>
        await request("/api/v1/telemetry/opt-in", {
          method: "POST",
          body: scopedBody(options),
        }),
      optOut: async () =>
        await request("/api/v1/telemetry/opt-out", {
          method: "POST",
          body: scopedBody(options),
        }),
      purge: async () =>
        await request("/api/v1/telemetry/events", {
          method: "DELETE",
          query: scopedQuery(options),
        }),
    },
  };
}

export function createTelemetryApiCallerFromEnv(
  env: TelemetryApiEnvironment = process.env as unknown as TelemetryApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createTelemetryApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function telemetryRequest(options: TelemetryApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
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
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function scopedQuery(options: TelemetryApiClientOptions): JsonRecord {
  return { orgId: options.orgId, userId: options.userId };
}

function scopedBody(options: TelemetryApiClientOptions): JsonRecord {
  return { orgId: options.orgId, userId: options.userId };
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Telemetry API request failed with ${status}.`;
}
