export interface WorkflowSettingsApiScope {
  orgId?: string;
  projectId?: string;
}

export type Methodology = "scrum" | "kanban" | "none";
export type WorkflowTransitionGraph = Record<string, string[]>;

export async function fetchWorkflowTransitions(
  fetchFn: typeof fetch,
  scope: WorkflowSettingsApiScope,
): Promise<WorkflowTransitionGraph> {
  const response = await workflowRequest<{ transitions?: WorkflowTransitionGraph }>(fetchFn, "/api/v1/workflows/transitions/get", {
    ...requireScope(scope),
  });
  return response.transitions ?? {};
}

export async function saveWorkflowTransitions(
  fetchFn: typeof fetch,
  scope: WorkflowSettingsApiScope,
  transitions: WorkflowTransitionGraph,
): Promise<WorkflowTransitionGraph> {
  const response = await workflowRequest<{ transitions?: WorkflowTransitionGraph }>(fetchFn, "/api/v1/workflows/transitions/update", {
    ...requireScope(scope),
    transitions,
  });
  return response.transitions ?? transitions;
}

export async function fetchDefaultWorkflowTransitions(
  fetchFn: typeof fetch,
  methodology: Methodology,
): Promise<WorkflowTransitionGraph> {
  const response = await workflowRequest<{ transitions?: WorkflowTransitionGraph }>(fetchFn, "/api/v1/workflows/default", {
    methodology,
  });
  return response.transitions ?? {};
}

async function workflowRequest<T>(
  fetchFn: typeof fetch,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetchFn(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(compact(body)),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(extractErrorMessage(payload, response.status));
  return payload as T;
}

function requireScope(input: WorkflowSettingsApiScope): Record<"orgId" | "projectId", string> {
  const orgId = input.orgId?.trim();
  const projectId = input.projectId?.trim();
  if (!orgId || !projectId) throw new Error("Organization and project scope are required.");
  return { orgId, projectId };
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string } } | null;
  return record?.message ?? record?.error?.message ?? `Workflow settings API request failed with ${status}.`;
}
