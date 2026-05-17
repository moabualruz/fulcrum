import { fail } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { createWorkflowApiCaller, WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";
import { workflowApiProjectMetadata } from "$lib/server/workflow-api";
import type { Actions, PageServerLoad } from "./$types";

interface SessionsEvent {
  fetch: typeof fetch;
  locals?: {
    activeProjectId?: string | null;
    orgId?: string | null;
    projectId?: string | null;
    workspaceId?: string | null;
    workspaceSlug?: string | null;
    workspaceName?: string | null;
  };
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface SessionsActionEvent extends SessionsEvent {
  request: SessionsEvent["request"] & { formData(): Promise<FormData> };
}

type GuidedAcpPermissionMode = "review_each_tool" | "allow_workspace" | "read_only";

export const load: PageServerLoad = async ({ locals }) => ({
  defaultProjectId: locals?.activeProjectId ?? null,
  defaultTraceId: `trace-${randomUUID()}`,
  defaultAcpSessionId: `acp-${randomUUID()}`,
});

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function field(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(fd: FormData, key: string): string | undefined {
  const value = field(fd, key);
  return value.length > 0 ? value : undefined;
}

function optionalNullableField(fd: FormData, key: string): string | null | undefined {
  const value = field(fd, key);
  return value.length > 0 ? value : undefined;
}

function parseCsv(raw: string): string[] {
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function optionalPositiveInteger(fd: FormData, key: string): number | undefined {
  const value = field(fd, key);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  return parsed;
}

function parsePermissionMode(
  value: string | undefined,
): { ok: true; value?: GuidedAcpPermissionMode } | { ok: false; error: string } {
  if (!value) return { ok: true };
  if (value === "review_each_tool" || value === "allow_workspace" || value === "read_only") {
    return { ok: true, value };
  }
  return { ok: false, error: "permissionMode must be review_each_tool, allow_workspace, or read_only" };
}

function createSessionsWorkflowApi(event: SessionsEvent) {
  return createWorkflowApiCaller({
    baseUrl: workflowApiBaseUrl(event),
    fetch: event.fetch,
    headers: {
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
}

function workflowApiBaseUrl(event: SessionsEvent): string {
  return (process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? baseUrl(event.url)).replace(/\/+$/, "");
}

function requireProjectId(event: SessionsEvent, projectId?: string | null): string {
  const resolved = projectId ?? event.locals?.activeProjectId ?? event.locals?.projectId ?? process.env["FULCRUM_PROJECT_ID"] ?? null;
  if (!resolved) throw new Error("projectId is required");
  return resolved;
}

function metadataFor(event: SessionsEvent, projectId: string) {
  return workflowApiProjectMetadata(event, projectId);
}

function apiInput<T extends object>(value: T): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function actionError(mode: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  const status = error instanceof WorkflowApiError && error.status >= 400 && error.status <= 599 ? error.status : 400;
  return fail(status, { ok: false, mode, error: message });
}

export const actions: Actions = {
  guidedAcpStart: async (event) => {
    const actionEvent = event as SessionsActionEvent;
    const fd = await actionEvent.request.formData();
    const agentName = field(fd, "acpAgentName");
    const cwd = field(fd, "acpCwd");
    const userPrompt = field(fd, "acpUserPrompt");
    const permissionMode = parsePermissionMode(optionalField(fd, "acpPermissionMode"));
    if (!agentName) return fail(400, { ok: false, mode: "guidedAcpStart", error: "acpAgentName is required" });
    if (!cwd) return fail(400, { ok: false, mode: "guidedAcpStart", error: "acpCwd is required" });
    if (!userPrompt) return fail(400, { ok: false, mode: "guidedAcpStart", error: "acpUserPrompt is required" });
    if (!permissionMode.ok) return fail(400, { ok: false, mode: "guidedAcpStart", error: permissionMode.error });

    try {
      const projectId = requireProjectId(actionEvent, optionalNullableField(fd, "projectId"));
      const guidedAcpStart = await createSessionsWorkflowApi(actionEvent).planning.startGuidedAcpPlanningSession(
        apiInput({
          ...metadataFor(actionEvent, projectId),
          acpSessionId: optionalField(fd, "acpSessionId") ?? `acp-${randomUUID()}`,
          agentName,
          cwd,
          userPrompt,
          promptTemplateId: optionalField(fd, "acpPromptTemplateId"),
          selectedDocIds: parseCsv(field(fd, "selectedDocIds")),
          projectId,
          traceId: optionalField(fd, "traceId"),
          modeId: optionalField(fd, "modeId"),
          modelId: optionalField(fd, "modelId"),
          permissionMode: permissionMode.value,
          maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
        }),
      );
      return { ok: true, mode: "guidedAcpStart", guidedAcpStart };
    } catch (error) {
      return actionError("guidedAcpStart", error);
    }
  },

  freeformStart: async (event) => {
    const actionEvent = event as SessionsActionEvent;
    const fd = await actionEvent.request.formData();
    const title = field(fd, "freeformTitle");
    const bodyMd = (fd.get("freeformBodyMd") as string | null ?? "").trim();
    const userPrompt = field(fd, "freeformUserPrompt");
    if (!title) return fail(400, { ok: false, mode: "freeformStart", error: "freeformTitle is required" });
    if (!bodyMd) return fail(400, { ok: false, mode: "freeformStart", error: "freeformBodyMd is required" });
    if (!userPrompt) return fail(400, { ok: false, mode: "freeformStart", error: "freeformUserPrompt is required" });

    try {
      const projectId = requireProjectId(actionEvent, optionalNullableField(fd, "projectId"));
      const freeformStart = await createSessionsWorkflowApi(actionEvent).planning.startFreeformWorkFromDocs(
        apiInput({
          ...metadataFor(actionEvent, projectId),
          title,
          bodyMd,
          userPrompt,
          projectId,
          parentId: optionalNullableField(fd, "parentId"),
          traceId: optionalField(fd, "traceId"),
          acpSessionId: optionalField(fd, "acpSessionId"),
          modeId: optionalField(fd, "modeId"),
          modelId: optionalField(fd, "modelId"),
          maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
        }),
      );
      return { ok: true, mode: "freeformStart", freeformStart };
    } catch (error) {
      return actionError("freeformStart", error);
    }
  },
};
