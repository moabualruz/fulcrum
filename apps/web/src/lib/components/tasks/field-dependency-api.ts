export interface FieldDependencyApiScope {
  orgId?: string;
  userId?: string;
  projectId?: string;
}

export type FieldDependencyAction = "show" | "hide" | "require";

export interface FieldDependencyRule {
  id: string;
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  action: FieldDependencyAction;
}

export async function listFieldDependencyRules(
  fetchFn: typeof fetch,
  scope: FieldDependencyApiScope,
): Promise<FieldDependencyRule[]> {
  const required = requireScope(scope);
  const query = new URLSearchParams(required);
  const rows = await requestPublicApi<unknown[]>(fetchFn, `/api/v1/field-dependencies?${query.toString()}`, {
    method: "GET",
  });
  return rows.map(normalizeRule);
}

export async function createFieldDependencyRule(
  fetchFn: typeof fetch,
  scope: FieldDependencyApiScope,
  input: Omit<FieldDependencyRule, "id">,
): Promise<FieldDependencyRule> {
  const required = requireScope(scope);
  const row = await requestPublicApi<unknown>(fetchFn, "/api/v1/field-dependencies", {
    method: "POST",
    body: JSON.stringify({
      ...required,
      sourceFieldId: input.sourceFieldId,
      sourceValue: input.sourceValue,
      targetFieldId: input.targetFieldId,
      action: input.action,
    }),
  });
  return normalizeRule(row);
}

export async function deleteFieldDependencyRule(
  fetchFn: typeof fetch,
  scope: Pick<FieldDependencyApiScope, "orgId" | "userId">,
  id: string,
): Promise<void> {
  const orgId = requireValue(scope.orgId, "Organization scope");
  const userId = requireValue(scope.userId, "User scope");
  const query = new URLSearchParams({ orgId, userId });
  await requestPublicApi(fetchFn, `/api/v1/field-dependencies/${encodeURIComponent(id)}?${query.toString()}`, {
    method: "DELETE",
  });
}

function normalizeRule(input: unknown): FieldDependencyRule {
  const row = input as Record<string, unknown>;
  return {
    id: String(row["id"] ?? ""),
    sourceFieldId: String(row["sourceFieldId"] ?? ""),
    sourceValue: String(row["sourceValue"] ?? ""),
    targetFieldId: String(row["targetFieldId"] ?? ""),
    action: normalizeAction(row["action"]),
  };
}

async function requestPublicApi<T>(fetchFn: typeof fetch, path: string, init: RequestInit): Promise<T> {
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

function requireScope(input: FieldDependencyApiScope): Record<"orgId" | "userId" | "projectId", string> {
  return {
    orgId: requireValue(input.orgId, "Organization scope"),
    userId: requireValue(input.userId, "User scope"),
    projectId: requireValue(input.projectId, "Project scope"),
  };
}

function requireValue(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function normalizeAction(value: unknown): FieldDependencyAction {
  return value === "show" || value === "hide" || value === "require" ? value : "require";
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string } } | null;
  return record?.message ?? record?.error?.message ?? `Field dependency API request failed with ${status}.`;
}
