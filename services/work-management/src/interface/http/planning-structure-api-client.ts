export interface PlanningStructureApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface PlanningStructureApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export class PlanningStructureApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlanningStructureApiError";
  }
}

const BASE_PATH = "/api/v1/planning-structures";

export function createPlanningStructureApiCaller(options: PlanningStructureApiClientOptions) {
  const request = planningStructureRequest(options);
  return {
    intake: {
      list: async (input: JsonRecord & { projectId: string }) =>
        await request(`${BASE_PATH}/intake`, { method: "GET", query: scopeQuery(options, input) }),
      get: async (input: JsonRecord & { id: string; projectId: string }) =>
        await request(`${BASE_PATH}/intake/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: scopeQuery(options, input),
        }),
      create: async (input: JsonRecord & { projectId: string }) =>
        await request(`${BASE_PATH}/intake`, { method: "POST", body: scopeBody(options, input) }),
      update: async (input: JsonRecord & { id: string; projectId: string }) => {
        const { id, ...body } = input;
        return await request(`${BASE_PATH}/intake/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: scopeBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { id: string; projectId: string }) =>
        await request(`${BASE_PATH}/intake/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: scopeQuery(options, input),
        }),
    },
    modules: {
      list: async (input: JsonRecord & { projectId: string }) =>
        await request(`${BASE_PATH}/modules`, { method: "GET", query: scopeQuery(options, input) }),
      get: async (input: JsonRecord & { id: string; projectId: string }) =>
        await request(`${BASE_PATH}/modules/${encodeURIComponent(input.id)}`, {
          method: "GET",
          query: scopeQuery(options, input),
        }),
      create: async (input: JsonRecord & { projectId: string }) =>
        await request(`${BASE_PATH}/modules`, { method: "POST", body: scopeBody(options, input) }),
      update: async (input: JsonRecord & { id: string; projectId: string }) => {
        const { id, ...body } = input;
        return await request(`${BASE_PATH}/modules/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: scopeBody(options, body),
        });
      },
      delete: async (input: JsonRecord & { id: string; projectId: string }) =>
        await request(`${BASE_PATH}/modules/${encodeURIComponent(input.id)}`, {
          method: "DELETE",
          query: scopeQuery(options, input),
        }),
    },
  };
}

export function createPlanningStructureApiCallerFromEnv(
  env: PlanningStructureApiEnvironment = process.env as unknown as PlanningStructureApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createPlanningStructureApiCaller({ baseUrl, orgId, fetch: fetchFn });
}

function planningStructureRequest(options: PlanningStructureApiClientOptions) {
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
    if (!response.ok) {
      throw new PlanningStructureApiError(extractErrorMessage(body, response.status), response.status);
    }
    return body as T;
  };
}

function scopeQuery(options: PlanningStructureApiClientOptions, input: JsonRecord): JsonRecord {
  return { orgId: options.orgId, projectId: input.projectId };
}

function scopeBody(options: PlanningStructureApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    ...input,
    orgId: options.orgId,
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
  return (
    record?.error?.json?.message ??
    record?.error?.message ??
    record?.message ??
    `Planning structure API request failed with ${status}.`
  );
}
