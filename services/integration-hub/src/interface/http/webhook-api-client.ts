export interface WebhookApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface WebhookApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createWebhookApiCaller(options: WebhookApiClientOptions) {
  const request = webhookRequest(options);
  return {
    webhooks: {
      list: async (input: { includeDisabled?: boolean } = {}) =>
        await request<unknown[]>("/api/v1/webhooks", { query: input }),
      get: async (input: { id: string }) =>
        await request(`/api/v1/webhooks/${encodeURIComponent(input.id)}`),
      create: async (input: JsonRecord) =>
        await request("/api/v1/webhooks", { method: "POST", body: input }),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body });
      },
      delete: async (input: { id: string }) =>
        await request<{ ok: true }>(`/api/v1/webhooks/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
      test: async (input: { id: string }) =>
        await request(`/api/v1/webhooks/${encodeURIComponent(input.id)}/test`, { method: "POST" }),
      deliveries: {
        list: async (input: { webhookId: string; limit?: number }) =>
          await request<unknown[]>(`/api/v1/webhooks/${encodeURIComponent(input.webhookId)}/deliveries`, {
            query: { limit: input.limit },
          }),
        get: async (input: { id: string }) =>
          await request(`/api/v1/webhooks/deliveries/${encodeURIComponent(input.id)}`),
        resend: async (input: { id: string }) =>
          await request(`/api/v1/webhooks/deliveries/${encodeURIComponent(input.id)}/resend`, { method: "POST" }),
      },
    },
  };
}

export function createWebhookApiCallerFromEnv(
  env: WebhookApiEnvironment = process.env as unknown as WebhookApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createWebhookApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function webhookRequest(options: WebhookApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T>(
    path: string,
    init: { method?: string; query?: Record<string, unknown>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    url.searchParams.set("orgId", options.orgId);
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

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Webhook API request failed with ${status}.`;
}
