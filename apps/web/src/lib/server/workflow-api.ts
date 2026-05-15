import { createWorkflowApiCaller } from "@workflow-coordination/interface/http/workflow-api-client";

interface WorkflowApiRouteEvent {
  fetch: typeof fetch;
  locals?: {
    orgId?: string | null;
    workspaceId?: string | null;
    workspaceSlug?: string | null;
    workspaceName?: string | null;
  };
  request: { headers: { get(name: string): string | null } };
}

interface WorkflowApiProjectMetadata {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
}

export function createWebWorkflowApiCaller(
  event: WorkflowApiRouteEvent,
  env: Record<string, string | undefined> = process.env,
) {
  const raw = workflowApiBaseUrl(env);
  if (!raw) return null;
  return createWorkflowApiCaller({
    baseUrl: raw,
    fetch: event.fetch,
    headers: {
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
}

export function webWorkflowApiUrl(
  path: string,
  query: Record<string, string | null | undefined>,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const baseUrl = workflowApiBaseUrl(env);
  if (!baseUrl) return null;
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function workflowApiProjectMetadata(
  event: WorkflowApiRouteEvent,
  projectId: string,
  env: Record<string, string | undefined> = process.env,
): WorkflowApiProjectMetadata {
  const workspaceId = (
    event.locals?.workspaceId ??
    event.locals?.orgId ??
    env["FULCRUM_WORKSPACE_ID"] ??
    env["FULCRUM_ORG_ID"] ??
    "local-workspace"
  );
  const workspaceSlug = (
    event.locals?.workspaceSlug ??
    env["FULCRUM_WORKSPACE_SLUG"] ??
    slugOf(workspaceId)
  );
  const workspaceName = (
    event.locals?.workspaceName ??
    env["FULCRUM_WORKSPACE_NAME"] ??
    titleOf(workspaceSlug)
  );
  return {
    workspaceId,
    workspaceSlug,
    workspaceName,
    projectId,
    projectSlug: env["FULCRUM_PROJECT_SLUG"] ?? slugOf(projectId),
    projectName: env["FULCRUM_PROJECT_NAME"] ?? titleOf(projectId),
  };
}

function slugOf(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

function titleOf(value: string): string {
  return value.trim() || "Workspace";
}

function workflowApiBaseUrl(env: Record<string, string | undefined>): string | null {
  const raw = env["FULCRUM_SERVER_URL"] ?? env["FULCRUM_PUBLIC_API_URL"];
  return raw ? raw.replace(/\/+$/, "") : null;
}
