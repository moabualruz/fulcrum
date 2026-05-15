export interface AuditApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface AuditApiClientOptions {
  baseUrl: string;
  orgId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface AuditApiFilters {
  project?: string;
  projectId?: string;
  user?: string;
  userId?: string;
  kind?: string;
  subjectKind?: string;
  subjectId?: string;
  verb?: string;
  since?: string | Date;
  until?: string | Date;
  dateRange?: {
    from?: string | Date;
    to?: string | Date;
  };
  limit?: number;
  offset?: number;
}

export interface AuditApiListResult {
  data: unknown[];
  total: number;
}

export type AuditApiExportResult =
  | { format: "csv" | "json"; content: string }
  | { jobId: string };

export type AuditApiExportStatus =
  | { status: "queued" | "running" }
  | { status: "completed"; format: "csv" | "json"; content: string }
  | { status: "failed"; error?: string };

export function createAuditApiClient(options: AuditApiClientOptions) {
  const request = auditRequest(options);
  return {
    query: async (input: AuditApiFilters = {}) => {
      const body = await requestAuditPage(request, input);
      return body.data;
    },
    queryPage: async (input: AuditApiFilters = {}): Promise<AuditApiListResult> =>
      await requestAuditPage(request, input),
    export: async (input: AuditApiFilters & { format: "csv" | "json" }): Promise<AuditApiExportResult> => {
      const body = await request<unknown[] | string | { jobId?: unknown }>("/api/v1/audit/export", {
        query: { ...auditQuery(input), format: input.format },
      });
      if (isExportJob(body)) return { jobId: body.jobId };
      return {
        format: input.format,
        content: input.format === "json" ? JSON.stringify(body) : String(body),
      };
    },
    exportStatus: async (jobId: string): Promise<AuditApiExportStatus> =>
      await request<AuditApiExportStatus>(`/api/v1/audit/export/${encodeURIComponent(jobId)}`),
    retentionPolicy: {
      get: async (input: { projectId?: string | null } = {}) =>
        await request("/api/v1/audit/retention-policy", { query: { projectId: input.projectId ?? undefined } }),
      list: async (input: { projectId?: string | null } = {}) =>
        await request("/api/v1/audit/retention-policies", { query: { projectId: input.projectId ?? undefined } }),
      set: async (input: { projectId?: string | null; retainDays: number }) =>
        await request("/api/v1/audit/retention-policy", {
          method: "PATCH",
          query: { projectId: input.projectId ?? undefined },
          body: { retainDays: input.retainDays },
        }),
    },
  };
}

async function requestAuditPage(
  request: <T>(path: string, init?: { method?: string; query?: Record<string, unknown>; body?: Record<string, unknown> }) => Promise<T>,
  input: AuditApiFilters,
): Promise<AuditApiListResult> {
  const body = await request<{ data?: unknown[]; total?: unknown }>("/api/v1/audit", { query: auditQuery(input) });
  const total = Number(body.total ?? 0);
  return {
    data: Array.isArray(body.data) ? body.data : [],
    total: Number.isFinite(total) ? total : 0,
  };
}

export function createAuditApiClientFromEnv(
  env: AuditApiEnvironment = process.env as unknown as AuditApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  if (!baseUrl || !orgId) return null;
  return createAuditApiClient({ baseUrl, orgId, fetch: fetchFn });
}

function auditRequest(options: AuditApiClientOptions) {
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
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function auditQuery(input: AuditApiFilters): Record<string, unknown> {
  return {
    projectId: input.projectId ?? input.project,
    userId: input.userId ?? input.user,
    kind: input.kind ?? input.subjectKind,
    subjectId: input.subjectId,
    verb: input.verb,
    since: toIsoString(input.since ?? input.dateRange?.from),
    until: toIsoString(input.until ?? input.dateRange?.to),
    limit: input.limit,
    offset: input.offset,
  };
}

function toIsoString(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function isExportJob(body: unknown): body is { jobId: string } {
  return Boolean(body && typeof body === "object" && typeof (body as { jobId?: unknown }).jobId === "string");
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Audit API request failed with ${status}.`;
}
