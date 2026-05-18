export interface FeatureExperimentApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface FeatureExperimentApiClientOptions {
  baseUrl: string;
  orgId?: string;
  userId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createFeatureExperimentApiCaller(options: FeatureExperimentApiClientOptions) {
  const request = featureExperimentRequest(options);
  return {
    flags: {
      list: async () =>
        await request("/api/v1/feature-flags", {
          query: scopedQuery(options, {}),
        }),
      evaluate: async (input: JsonRecord) =>
        await request("/api/v1/feature-flags/evaluate", {
          query: scopedQuery(options, input),
        }),
      set: async (input: JsonRecord) =>
        await request("/api/v1/feature-flags", {
          method: "PATCH",
          body: scopedBody(options, input),
        }),
      setOverride: async (input: JsonRecord) =>
        await request("/api/v1/feature-flags/override", {
          method: "PATCH",
          body: scopedBody(options, input),
        }),
      setRollout: async (input: JsonRecord) =>
        await request("/api/v1/feature-flags/rollout", {
          method: "PATCH",
          body: scopedBody(options, input),
        }),
      experiments: {
        list: async () => await request("/api/v1/feature-flags/experiments"),
        create: async (input: JsonRecord) =>
          await request("/api/v1/feature-flags/experiments", {
            method: "POST",
            body: compact({
              name: input.name,
              description: input.description,
              variants: input.variants,
              rolloutPercent: input.rolloutPercent ?? input.rollout_percent,
            }),
          }),
        assignments: async (input: { experimentId: string }) =>
          await request(`/api/v1/feature-flags/experiments/${encodeURIComponent(input.experimentId)}/assignments`),
        metrics: async (input: { experimentId: string; conversionKind: string }) =>
          await request(`/api/v1/feature-flags/experiments/${encodeURIComponent(input.experimentId)}/metrics`, {
            query: { conversionKind: input.conversionKind },
          }),
      },
    },
  };
}

export function createFeatureExperimentApiCallerFromEnv(
  env: FeatureExperimentApiEnvironment = process.env as unknown as FeatureExperimentApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createFeatureExperimentApiCaller({
    baseUrl,
    orgId: env.FULCRUM_ORG_ID,
    userId: env.FULCRUM_USER_ID,
    fetch: fetchFn,
  });
}

function featureExperimentRequest(options: FeatureExperimentApiClientOptions) {
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

function scopedQuery(options: FeatureExperimentApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    ...input,
  });
}

function scopedBody(options: FeatureExperimentApiClientOptions, input: JsonRecord): JsonRecord {
  const orgId = input.orgId ?? options.orgId;
  if (!orgId) throw new Error("FULCRUM_ORG_ID is required for feature flag writes.");
  return compact({
    ...input,
    orgId,
  });
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Feature experiment API request failed with ${status}.`;
}
