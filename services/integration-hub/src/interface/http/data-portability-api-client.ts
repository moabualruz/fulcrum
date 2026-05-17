export interface DataPortabilityApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface DataPortabilityApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createDataPortabilityApiCaller(options: DataPortabilityApiClientOptions) {
  const request = dataPortabilityRequest(options);
  return {
    backup: {
      create: async () =>
        await request("/api/v1/data-portability/backup", {
          method: "POST",
          body: scopedBody(options, {}),
        }),
      restore: async (input: JsonRecord) =>
        await request("/api/v1/data-portability/backup/restore", {
          method: "POST",
          body: scopedBody(options, input),
        }),
    },
    dataExport: {
      create: async (input: JsonRecord = {}) =>
        await request("/api/v1/data-portability/export", {
          method: "POST",
          body: scopedBody(options, input),
        }),
    },
    dataImport: {
      preflight: async (input: JsonRecord) =>
        await request("/api/v1/data-portability/import/preflight", {
          query: scopedQuery(options, input),
        }),
      run: async (input: JsonRecord) =>
        await request("/api/v1/data-portability/import/run", {
          method: "POST",
          body: scopedBody(options, input),
        }),
    },
  };
}

export function createDataPortabilityApiCallerFromEnv(
  env: DataPortabilityApiEnvironment = process.env as unknown as DataPortabilityApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createDataPortabilityApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function dataPortabilityRequest(options: DataPortabilityApiClientOptions) {
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

function scopedQuery(options: DataPortabilityApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function scopedBody(options: DataPortabilityApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Data portability API request failed with ${status}.`;
}
