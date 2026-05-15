export interface SkillSupplyApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface SkillSupplyApiClientOptions {
  baseUrl: string;
  orgId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createSkillSupplyApiCaller(options: SkillSupplyApiClientOptions) {
  const request = skillSupplyRequest(options);
  return {
    fulcrumSkills: {
      list: async () =>
        await request("/api/v1/skills", {
          query: scopedQuery(options, {}),
        }),
      registryList: async (input: JsonRecord = {}) =>
        await request("/api/v1/skills/registry", {
          query: scopedQuery(options, input),
        }),
      install: async (input: JsonRecord) =>
        await request("/api/v1/skills", {
          method: "POST",
          body: input,
        }),
      upgrade: async (input: JsonRecord) =>
        await request("/api/v1/skills/upgrade", {
          method: "POST",
          body: input,
        }),
      uninstall: async (input: { slug: string }) =>
        await request(`/api/v1/skills/${encodeURIComponent(input.slug)}`, {
          method: "DELETE",
        }),
      sync: async (input: JsonRecord) =>
        await request("/api/v1/skills/sync", {
          method: "POST",
          body: input,
        }),
      resolveConflict: async (input: JsonRecord) =>
        await request("/api/v1/skills/conflicts/resolve", {
          method: "POST",
          body: input,
        }),
      conflicts: {
        list: async () => await request("/api/v1/skills/conflicts"),
        override: async (input: JsonRecord) =>
          await request("/api/v1/skills/conflicts/override", {
            method: "POST",
            body: input,
          }),
      },
      lock: {
        override: async (input: JsonRecord) =>
          await request("/api/v1/skills/lock", {
            method: "PATCH",
            body: input,
          }),
      },
    },
  };
}

export function createSkillSupplyApiCallerFromEnv(
  env: SkillSupplyApiEnvironment = process.env as unknown as SkillSupplyApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createSkillSupplyApiCaller({
    baseUrl,
    orgId: env.FULCRUM_ORG_ID,
    fetch: fetchFn,
  });
}

function skillSupplyRequest(options: SkillSupplyApiClientOptions) {
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

function scopedQuery(options: SkillSupplyApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    ...input,
  });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Skill supply API request failed with ${status}.`;
}
