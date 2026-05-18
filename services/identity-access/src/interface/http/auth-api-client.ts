export interface AuthApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface AuthApiClientOptions {
  baseUrl: string;
  orgId?: string;
  userId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createAuthApiCaller(options: AuthApiClientOptions) {
  const request = authRequest(options);
  return {
    auth: {
      whoami: async () =>
        await request("/api/v1/auth/whoami", {
          query: scopedQuery(options, {}),
        }),
      invite: async (input: JsonRecord) =>
        await request("/api/v1/auth/invite", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      acceptInvite: async (input: JsonRecord) =>
        await request("/api/v1/auth/accept-invite", {
          method: "POST",
          body: input,
        }),
      requestEmailVerification: async (input: JsonRecord) =>
        await request("/api/v1/auth/email-verification/request", {
          method: "POST",
          body: scopedBody(options, input),
        }),
      verifyEmail: async (input: JsonRecord) =>
        await request("/api/v1/auth/email-verification/verify", {
          method: "POST",
          body: input,
        }),
    },
  };
}

export function createAuthApiCallerFromEnv(
  env: AuthApiEnvironment = process.env as unknown as AuthApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createAuthApiCaller({
    baseUrl,
    orgId: env.FULCRUM_ORG_ID,
    userId: env.FULCRUM_USER_ID,
    fetch: fetchFn,
  });
}

function authRequest(options: AuthApiClientOptions) {
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

function scopedQuery(options: AuthApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: requiredScope(options, "orgId"), userId: requiredScope(options, "userId"), ...input });
}

function scopedBody(options: AuthApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: requiredScope(options, "orgId"), userId: requiredScope(options, "userId"), ...input });
}

function requiredScope(options: AuthApiClientOptions, key: "orgId" | "userId"): string {
  const value = options[key];
  if (value) return value;
  throw new Error(`Auth API caller requires ${key}. Set FULCRUM_ORG_ID and FULCRUM_USER_ID for scoped auth commands.`);
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Auth API request failed with ${status}.`;
}
