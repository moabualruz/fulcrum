export interface ConnectorApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface ConnectorApiClientOptions {
  baseUrl: string;
  orgId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createConnectorApiCaller(options: ConnectorApiClientOptions) {
  const request = connectorRequest(options);
  return {
    connectors: {
      list: async () => await request("/api/v1/connectors", { query: scopedQuery(options) }),
      get: async (input: { id: string }) =>
        await request(`/api/v1/connectors/${encodeURIComponent(input.id)}`, {
          query: scopedQuery(options),
        }),
      enable: async (input: { id: string; config?: JsonRecord }) =>
        await request(`/api/v1/connectors/${encodeURIComponent(input.id)}/enable`, {
          method: "POST",
          body: scopedBody(options, { config: input.config }),
        }),
      disable: async (input: { id: string }) =>
        await request(`/api/v1/connectors/${encodeURIComponent(input.id)}/disable`, {
          method: "POST",
          body: scopedBody(options),
        }),
      sync: async (input: { id: string; trigger?: string }) =>
        await request(`/api/v1/connectors/${encodeURIComponent(input.id)}/sync`, {
          method: "POST",
          body: scopedBody(options, { trigger: input.trigger }),
        }),
      runs: {
        list: async (input: { connectorId?: string } = {}) =>
          await request("/api/v1/connector-runs", {
            query: scopedQuery(options, { connectorId: input.connectorId }),
          }),
        get: async (input: { id: string }) =>
          await request(`/api/v1/connector-runs/${encodeURIComponent(input.id)}`, {
            query: scopedQuery(options),
          }),
      },
    },
  };
}

export function createConnectorApiCallerFromEnv(
  env: ConnectorApiEnvironment = process.env as unknown as ConnectorApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createConnectorApiCaller({ baseUrl, orgId: env.FULCRUM_ORG_ID, fetch: fetchFn });
}

function connectorRequest(options: ConnectorApiClientOptions) {
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

function scopedQuery(options: ConnectorApiClientOptions, input: JsonRecord = {}): JsonRecord {
  return compact({ orgId: options.orgId, ...input });
}

function scopedBody(options: ConnectorApiClientOptions, input: JsonRecord = {}): JsonRecord {
  if (!options.orgId) throw new Error("FULCRUM_ORG_ID is required for connector writes.");
  return compact({ orgId: options.orgId, ...input });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Connector API request failed with ${status}.`;
}
