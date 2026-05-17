export interface AutomationApiScope {
  orgId?: string;
  userId?: string;
  projectId?: string;
}

type JsonRecord = Record<string, unknown>;

export interface AutomationRule {
  id: string;
  name: string;
  triggerType: string;
  triggerConfig: JsonRecord;
  actionType: string;
  actionConfig: JsonRecord;
  enabled: boolean;
  executionCount: number;
  condition?: { field: string; operator: string; value: string } | null;
}

export interface AutomationTemplate {
  id?: string;
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: JsonRecord;
  actionType: string;
  actionConfig: JsonRecord;
  condition?: { field: string; operator: string; value: string } | null;
}

export async function listAutomationRules(
  fetchFn: typeof fetch,
  scope: AutomationApiScope,
): Promise<AutomationRule[]> {
  const required = requireScope(scope);
  const url = new URL("/api/v1/automations", "http://fulcrum.local");
  addScope(url, required);
  const rows = await requestPublicApi<unknown[]>(fetchFn, pathnameWithSearch(url), { method: "GET" });
  return rows.map(normalizeRule);
}

export async function createAutomationRule(
  fetchFn: typeof fetch,
  scope: AutomationApiScope,
  input: Omit<AutomationRule, "id" | "enabled" | "executionCount">,
): Promise<AutomationRule> {
  const required = requireScope(scope);
  const row = await requestPublicApi<unknown>(fetchFn, "/api/v1/automations", {
    method: "POST",
    body: JSON.stringify(compact({
      ...required,
      name: input.name,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig,
      condition: input.condition,
      actionType: input.actionType,
      actionConfig: input.actionConfig,
    })),
  });
  return normalizeRule(row);
}

export async function updateAutomationRule(
  fetchFn: typeof fetch,
  scope: Pick<AutomationApiScope, "orgId" | "userId">,
  input: { id: string; enabled?: boolean },
): Promise<AutomationRule> {
  const required = requireOrgUserScope(scope);
  const row = await requestPublicApi<unknown>(fetchFn, `/api/v1/automations/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    body: JSON.stringify(compact({ ...required, enabled: input.enabled })),
  });
  return normalizeRule(row);
}

export async function deleteAutomationRule(
  fetchFn: typeof fetch,
  scope: Pick<AutomationApiScope, "orgId" | "userId">,
  input: { id: string },
): Promise<void> {
  const required = requireOrgUserScope(scope);
  const url = new URL(`/api/v1/automations/${encodeURIComponent(input.id)}`, "http://fulcrum.local");
  url.searchParams.set("orgId", required.orgId);
  url.searchParams.set("userId", required.userId);
  await requestPublicApi(fetchFn, pathnameWithSearch(url), { method: "DELETE" });
}

export async function listAutomationTemplates(
  fetchFn: typeof fetch,
  scope: Pick<AutomationApiScope, "orgId" | "userId">,
): Promise<AutomationTemplate[]> {
  const required = requireOrgUserScope(scope);
  const url = new URL("/api/v1/automations/templates", "http://fulcrum.local");
  url.searchParams.set("orgId", required.orgId);
  url.searchParams.set("userId", required.userId);
  const rows = await requestPublicApi<unknown[]>(fetchFn, pathnameWithSearch(url), { method: "GET" });
  return rows.map(normalizeTemplate);
}

function normalizeRule(input: unknown): AutomationRule {
  const row = input as JsonRecord;
  return {
    id: String(row["id"] ?? ""),
    name: String(row["name"] ?? ""),
    triggerType: String(row["triggerType"] ?? ""),
    triggerConfig: jsonRecord(row["triggerConfig"]),
    actionType: String(row["actionType"] ?? ""),
    actionConfig: jsonRecord(row["actionConfig"]),
    enabled: row["enabled"] !== false,
    executionCount: Number(row["executionCount"] ?? 0),
    condition: normalizeCondition(row["condition"]),
  };
}

function normalizeTemplate(input: unknown): AutomationTemplate {
  const row = normalizeRule(input);
  return {
    ...row,
    id: typeof (input as JsonRecord)["id"] === "string" ? row.id : undefined,
    description: String((input as JsonRecord)["description"] ?? ""),
  };
}

function normalizeCondition(input: unknown): AutomationRule["condition"] {
  if (!input || typeof input !== "object") return null;
  const record = input as JsonRecord;
  return {
    field: String(record["field"] ?? ""),
    operator: String(record["operator"] ?? "equals"),
    value: String(record["value"] ?? ""),
  };
}

function requireScope(input: AutomationApiScope): Record<"orgId" | "userId" | "projectId", string> {
  const orgUser = requireOrgUserScope(input);
  const projectId = input.projectId?.trim();
  if (!projectId) throw new Error("Project scope is required.");
  return { ...orgUser, projectId };
}

function requireOrgUserScope(input: Pick<AutomationApiScope, "orgId" | "userId">): Record<"orgId" | "userId", string> {
  const orgId = input.orgId?.trim();
  const userId = input.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  return { orgId, userId };
}

function addScope(url: URL, scope: Record<"orgId" | "userId" | "projectId", string>): void {
  url.searchParams.set("orgId", scope.orgId);
  url.searchParams.set("userId", scope.userId);
  url.searchParams.set("projectId", scope.projectId);
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) =>
    value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
  ));
}

function pathnameWithSearch(url: URL): string {
  return `${url.pathname}${url.search}`;
}

async function requestPublicApi<T>(
  fetchFn: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchFn(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
  return body as T;
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string } } | null;
  return record?.message ?? record?.error?.message ?? `Automation API request failed with ${status}.`;
}
