import { fail } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { createWorkflowApiCaller, WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";
import { workflowApiProjectMetadata } from "$lib/server/workflow-api";
import type { Actions, PageServerLoad } from "./$types";

interface PlanningEvent {
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

interface PlanningActionEvent extends PlanningEvent {
  request: PlanningEvent["request"] & { formData(): Promise<FormData> };
}

interface SourceDocRef {
  kind: string;
  id: string;
}

interface ApprovedPlanInput {
  planId: string;
  approvedPlanMarkdown: string;
  traceId?: string;
  reviewId?: string;
  projectId?: string | null;
  cycleId?: string | null;
  moduleId?: string | null;
  sourceDocRefs?: SourceDocRef[];
}

interface FreeformPromptInput {
  userPrompt: string;
  selectedDocIds?: string[];
  traceId?: string;
  projectId?: string | null;
  maxDocChars?: number;
}

interface FreeformStartInput {
  title: string;
  bodyMd: string;
  userPrompt: string;
  projectId?: string | null;
  parentId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

interface GuidedAcpStartInput {
  acpSessionId?: string;
  agentName: string;
  cwd: string;
  userPrompt: string;
  promptTemplateId?: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: "review_each_tool" | "allow_workspace" | "read_only";
  maxDocChars?: number;
}

type GuidedAcpPermissionMode = NonNullable<GuidedAcpStartInput["permissionMode"]>;

interface ContinuousUpdateChangedDocInput {
  id?: string;
  title?: string;
  bodyMd?: string;
}

interface ContinuousUpdateInput {
  trigger: "manual_doc_edit" | "acp_session_update";
  userPrompt: string;
  selectedDocIds?: string[];
  targetTaskIds?: string[];
  changedDocs?: ContinuousUpdateChangedDocInput[];
  projectId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

type TechnicalPlanningSource = "freeform_docs" | "guided_acp" | "continuous_update";

interface TechnicalPlanningInput {
  source: TechnicalPlanningSource;
  userPrompt: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  maxDocChars?: number;
  planId?: string;
  reviewId?: string;
  prototypePaths?: string[];
  boilerplatePaths?: string[];
  successCriteria?: string[];
}

type WorkflowCycleInput = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

export const load: PageServerLoad = async ({ locals }) => ({
  defaultPlanId: `plan-${randomUUID()}`,
  defaultProjectId: locals?.activeProjectId ?? null,
  defaultTraceId: `trace-${randomUUID()}`,
});

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function field(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function rawField(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
}

function optionalField(fd: FormData, key: string): string | undefined {
  const value = field(fd, key);
  return value.length > 0 ? value : undefined;
}

function optionalNullableField(fd: FormData, key: string): string | null | undefined {
  const value = field(fd, key);
  return value.length > 0 ? value : undefined;
}

function parseSourceDocRefs(raw: string): { ok: true; value: SourceDocRef[] } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, value: [] };
  const refs: SourceDocRef[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (!item) continue;
    const separator = item.indexOf(":");
    if (separator <= 0 || separator === item.length - 1) {
      return { ok: false, error: "source doc refs must use kind:id entries" };
    }
    const kind = item.slice(0, separator).trim();
    const id = item.slice(separator + 1).trim();
    if (!kind || !id) return { ok: false, error: "source doc refs must use kind:id entries" };
    refs.push({ kind, id });
  }
  return { ok: true, value: refs };
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

function approvedPlanInput(fd: FormData): { ok: true; value: ApprovedPlanInput } | { ok: false; error: string } {
  const planId = field(fd, "planId");
  const approvedPlanMarkdown = rawField(fd, "approvedPlanMarkdown");
  if (!planId) return { ok: false, error: "planId is required" };
  if (!approvedPlanMarkdown.trim()) return { ok: false, error: "approvedPlanMarkdown is required" };

  const sourceDocRefs = parseSourceDocRefs(field(fd, "sourceDocRefs"));
  if (!sourceDocRefs.ok) return sourceDocRefs;

  return {
    ok: true,
    value: {
      planId,
      approvedPlanMarkdown,
      projectId: optionalNullableField(fd, "projectId"),
      traceId: optionalField(fd, "traceId"),
      reviewId: optionalField(fd, "reviewId"),
      cycleId: optionalNullableField(fd, "cycleId"),
      moduleId: optionalNullableField(fd, "moduleId"),
      sourceDocRefs: sourceDocRefs.value,
    },
  };
}

function freeformPromptInput(fd: FormData): { ok: true; value: FreeformPromptInput } | { ok: false; error: string } {
  const userPrompt = field(fd, "freeformUserPrompt");
  if (!userPrompt) return { ok: false, error: "freeformUserPrompt is required" };
  try {
    return {
      ok: true,
      value: {
        userPrompt,
        selectedDocIds: parseCsv(field(fd, "selectedDocIds")),
        projectId: optionalNullableField(fd, "projectId"),
        traceId: optionalField(fd, "traceId"),
        maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function freeformStartInput(fd: FormData): { ok: true; value: FreeformStartInput } | { ok: false; error: string } {
  const title = field(fd, "freeformTitle");
  const bodyMd = rawField(fd, "freeformBodyMd");
  const userPrompt = field(fd, "freeformUserPrompt");
  if (!title) return { ok: false, error: "freeformTitle is required" };
  if (!bodyMd.trim()) return { ok: false, error: "freeformBodyMd is required" };
  if (!userPrompt) return { ok: false, error: "freeformUserPrompt is required" };
  try {
    return {
      ok: true,
      value: {
        title,
        bodyMd,
        userPrompt,
        projectId: optionalNullableField(fd, "projectId"),
        parentId: optionalNullableField(fd, "parentId"),
        traceId: optionalField(fd, "traceId"),
        acpSessionId: optionalField(fd, "acpSessionId"),
        modeId: optionalField(fd, "modeId"),
        modelId: optionalField(fd, "modelId"),
        maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function guidedAcpStartInput(fd: FormData): { ok: true; value: GuidedAcpStartInput } | { ok: false; error: string } {
  const agentName = field(fd, "acpAgentName");
  const cwd = field(fd, "acpCwd");
  const userPrompt = field(fd, "acpUserPrompt");
  const parsedPermissionMode = guidedAcpPermissionMode(optionalField(fd, "acpPermissionMode"));
  if (!agentName) return { ok: false, error: "acpAgentName is required" };
  if (!cwd) return { ok: false, error: "acpCwd is required" };
  if (!userPrompt) return { ok: false, error: "acpUserPrompt is required" };
  if (!parsedPermissionMode.ok) return parsedPermissionMode;
  try {
    return {
      ok: true,
      value: {
        acpSessionId: optionalField(fd, "acpSessionId"),
        agentName,
        cwd,
        userPrompt,
        promptTemplateId: optionalField(fd, "acpPromptTemplateId"),
        selectedDocIds: parseCsv(field(fd, "selectedDocIds")),
        projectId: optionalNullableField(fd, "projectId"),
        traceId: optionalField(fd, "traceId"),
        modeId: optionalField(fd, "modeId"),
        modelId: optionalField(fd, "modelId"),
        permissionMode: parsedPermissionMode.value,
        maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function guidedAcpPermissionMode(
  value: string | undefined,
): { ok: true; value?: GuidedAcpPermissionMode } | { ok: false; error: string } {
  if (!value) return { ok: true };
  if (value === "review_each_tool" || value === "allow_workspace" || value === "read_only") {
    return { ok: true, value };
  }
  return { ok: false, error: "acpPermissionMode must be review_each_tool, allow_workspace, or read_only" };
}

function continuousUpdateInput(fd: FormData): { ok: true; value: ContinuousUpdateInput } | { ok: false; error: string } {
  const trigger = field(fd, "continuousTrigger");
  const userPrompt = field(fd, "continuousUserPrompt");
  if (trigger !== "manual_doc_edit" && trigger !== "acp_session_update") {
    return { ok: false, error: "continuousTrigger must be manual_doc_edit or acp_session_update" };
  }
  if (!userPrompt) return { ok: false, error: "continuousUserPrompt is required" };

  const changedDoc = {
    id: optionalField(fd, "continuousDocId"),
    title: optionalField(fd, "continuousTitle"),
    bodyMd: rawField(fd, "continuousBodyMd").trim() ? rawField(fd, "continuousBodyMd") : undefined,
  };
  const changedDocs = Object.values(changedDoc).some((value) => value !== undefined) ? [changedDoc] : undefined;

  try {
    return {
      ok: true,
      value: {
        trigger,
        userPrompt,
        projectId: optionalNullableField(fd, "projectId"),
        traceId: optionalField(fd, "traceId"),
        acpSessionId: optionalField(fd, "acpSessionId"),
        modeId: optionalField(fd, "modeId"),
        modelId: optionalField(fd, "modelId"),
        selectedDocIds: parseCsv(field(fd, "selectedDocIds")),
        targetTaskIds: parseCsv(field(fd, "targetTaskIds")),
        changedDocs,
        maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function technicalPlanningInput(fd: FormData): { ok: true; value: TechnicalPlanningInput } | { ok: false; error: string } {
  const source = field(fd, "technicalSource");
  const userPrompt = field(fd, "technicalUserPrompt");
  if (source !== "freeform_docs" && source !== "guided_acp" && source !== "continuous_update") {
    return { ok: false, error: "technicalSource must be freeform_docs, guided_acp, or continuous_update" };
  }
  if (!userPrompt) return { ok: false, error: "technicalUserPrompt is required" };

  try {
    return {
      ok: true,
      value: {
        source,
        userPrompt,
        selectedDocIds: parseCsv(field(fd, "selectedDocIds")),
        projectId: optionalNullableField(fd, "projectId"),
        traceId: optionalField(fd, "traceId"),
        maxDocChars: optionalPositiveInteger(fd, "maxDocChars"),
        planId: optionalField(fd, "planId"),
        reviewId: optionalField(fd, "reviewId"),
        prototypePaths: parseCsv(field(fd, "prototypePaths")),
        boilerplatePaths: parseCsv(field(fd, "boilerplatePaths")),
        successCriteria: parseCsv(field(fd, "successCriteria")),
      },
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function workflowCycleInput(fd: FormData): { ok: true; value: WorkflowCycleInput } | { ok: false; error: string } {
  const raw = rawField(fd, "workflowCycleJson");
  if (!raw.trim()) return { ok: false, error: "workflowCycleJson is required" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "workflowCycleJson must be a JSON object" };
    }
    return { ok: true, value: parsed as WorkflowCycleInput };
  } catch {
    return { ok: false, error: "workflowCycleJson must be valid JSON" };
  }
}

function enrichWorkflowCycleInput(event: PlanningEvent, input: WorkflowCycleInput): WorkflowCycleInput {
  const workspace = objectValue(input["workspace"]);
  const project = objectValue(input["project"]);
  const projectId = stringValue(project?.["id"]) ?? stringValue(input["projectId"]) ?? requireProjectId(event);
  const metadata = metadataFor(event, projectId);
  return {
    ...input,
    workspace: {
      id: metadata.workspaceId,
      slug: metadata.workspaceSlug,
      name: metadata.workspaceName,
      ...workspace,
    },
    project: {
      id: projectId,
      slug: metadata.projectSlug,
      name: metadata.projectName,
      traceId: stringValue(input["traceId"]) ?? `trace-${randomUUID()}`,
      ...project,
    },
  };
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function createPlanningWorkflowApi(event: PlanningEvent) {
  return createWorkflowApiCaller({
    baseUrl: workflowApiBaseUrl(event),
    fetch: event.fetch,
    headers: {
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
}

function workflowApiBaseUrl(event: PlanningEvent): string {
  return (process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? baseUrl(event.url)).replace(/\/+$/, "");
}

function projectIdFrom(event: PlanningEvent, projectId?: string | null): string | null {
  return projectId ?? event.locals?.activeProjectId ?? event.locals?.projectId ?? process.env["FULCRUM_PROJECT_ID"] ?? null;
}

function requireProjectId(event: PlanningEvent, projectId?: string | null): string {
  const resolved = projectIdFrom(event, projectId);
  if (!resolved) throw new Error("projectId is required");
  return resolved;
}

function metadataFor(event: PlanningEvent, projectId: string) {
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
  workflowCycle: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = workflowCycleInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "workflowCycle", error: parsed.error });
    try {
      const workflowCycle = await createPlanningWorkflowApi(actionEvent).workflows.runAcceptanceCycle(
        enrichWorkflowCycleInput(actionEvent, parsed.value),
      );
      return { ok: true, mode: "workflowCycle", workflowCycle };
    } catch (error) {
      return actionError("workflowCycle", error);
    }
  },

  generate: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = technicalPlanningInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "generate", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const technicalPlanning = await createPlanningWorkflowApi(actionEvent).planning.generateTechnicalPlanningCycle(
        apiInput({ ...parsed.value, projectId }),
      );
      return { ok: true, mode: "generate", technicalPlanning };
    } catch (error) {
      return actionError("generate", error);
    }
  },

  continuousUpdate: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = continuousUpdateInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "continuousUpdate", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const continuousUpdate = await createPlanningWorkflowApi(actionEvent).planning.restartPlanningCycleFromUpdates(
        apiInput({ ...metadataFor(actionEvent, projectId), ...parsed.value, projectId }),
      );
      return { ok: true, mode: "continuousUpdate", continuousUpdate };
    } catch (error) {
      return actionError("continuousUpdate", error);
    }
  },

  guidedAcpStart: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = guidedAcpStartInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "guidedAcpStart", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const guidedAcpStart = await createPlanningWorkflowApi(actionEvent).planning.startGuidedAcpPlanningSession(
        apiInput({
          ...metadataFor(actionEvent, projectId),
          ...parsed.value,
          acpSessionId: parsed.value.acpSessionId ?? `acp-${randomUUID()}`,
          projectId,
        }),
      );
      return { ok: true, mode: "guidedAcpStart", guidedAcpStart };
    } catch (error) {
      return actionError("guidedAcpStart", error);
    }
  },

  freeformStart: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = freeformStartInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "freeformStart", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const freeformStart = await createPlanningWorkflowApi(actionEvent).planning.startFreeformWorkFromDocs(
        apiInput({ ...metadataFor(actionEvent, projectId), ...parsed.value, projectId }),
      );
      return { ok: true, mode: "freeformStart", freeformStart };
    } catch (error) {
      return actionError("freeformStart", error);
    }
  },

  freeformPrompt: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = freeformPromptInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "freeformPrompt", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const freeformPrompt = await createPlanningWorkflowApi(actionEvent).planning.buildFreeformDocsPlanningPrompt(
        apiInput({ ...parsed.value, projectId }),
      );
      return { ok: true, mode: "freeformPrompt", freeformPrompt };
    } catch (error) {
      return actionError("freeformPrompt", error);
    }
  },

  preview: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = approvedPlanInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "preview", error: parsed.error });
    try {
      const preview = await createPlanningWorkflowApi(actionEvent).planning.previewApprovedPlanBreakdown(
        apiInput(parsed.value),
      );
      return { ok: true, mode: "preview", preview };
    } catch (error) {
      return actionError("preview", error);
    }
  },

  materialize: async (event) => {
    const actionEvent = event as PlanningActionEvent;
    const parsed = approvedPlanInput(await actionEvent.request.formData());
    if (!parsed.ok) return fail(400, { ok: false, mode: "materialize", error: parsed.error });
    try {
      const projectId = requireProjectId(actionEvent, parsed.value.projectId);
      const materialized = await createPlanningWorkflowApi(actionEvent).planning.materializeApprovedPlanBreakdown(
        apiInput({ ...metadataFor(actionEvent, projectId), ...parsed.value, projectId }),
      );
      return { ok: true, mode: "materialize", materialized };
    } catch (error) {
      return actionError("materialize", error);
    }
  },
};
