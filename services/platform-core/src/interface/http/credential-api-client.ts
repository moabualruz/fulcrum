export interface CredentialApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface CredentialApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId?: string | null;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createCredentialApiCaller(options: CredentialApiClientOptions) {
  const request = credentialRequest(options);
  return {
    settingsSecrets: {
      list: async () =>
        await request("/api/v1/credentials/settings-secrets", {
          query: scopedQuery(options, {}),
        }),
      add: async (input: JsonRecord) =>
        await request("/api/v1/credentials/settings-secrets", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      rotate: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/credentials/settings-secrets/${encodeURIComponent(id)}/rotate`, {
          method: "POST",
          body: scopedBody(options, body),
        });
      },
      archive: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/credentials/settings-secrets/${encodeURIComponent(id)}/archive`, {
          method: "POST",
          body: scopedBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/credentials/settings-secrets/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: scopedQuery(options, input),
        }),
    },
  };
}

export function createCredentialApiCallerFromEnv(
  env: CredentialApiEnvironment = process.env as unknown as CredentialApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createCredentialApiCaller({
    baseUrl,
    orgId,
    userId: env.FULCRUM_USER_ID,
    fetch: fetchFn,
  });
}

function credentialRequest(options: CredentialApiClientOptions) {
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

function scopedQuery(options: CredentialApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function scopedBody(options: CredentialApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ ...input, orgId: options.orgId, userId: options.userId });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Credential API request failed with ${status}.`;
}
