import { fail } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import type { Actions, PageServerLoad } from "./$types";
import {
  createWebWorkflowApiCaller,
  workflowApiProjectMetadata,
} from "$lib/server/workflow-api";

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

interface PlanEvent {
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
  params: { id: string };
}

export const load: PageServerLoad = async ({ params }) => {
  const projectId = params.id;
  return {
    projectId,
    defaultPlanId: `plan-${randomUUID()}`,
    defaultTraceId: `trace-materialize-${randomUUID()}`,
    preview: null,
    materialized: null,
  };
};

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

function apiInput<T extends object>(value: T): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export const actions: Actions = {
  preview: async (event) => {
    const fd = await event.request.formData();
    const parsed = approvedPlanInput(fd);
    if (!parsed.ok) return fail(400, { ok: false, mode: "preview", error: parsed.error });
    try {
      const workflowApi = createWebWorkflowApiCaller(event);
      if (!workflowApi) return fail(503, { ok: false, mode: "preview", error: "Workflow API not configured" });
      const preview = await workflowApi.planning.previewApprovedPlanBreakdown(apiInput(parsed.value));
      return { ok: true, mode: "preview", preview };
    } catch (err) {
      return fail(400, { ok: false, mode: "preview", error: (err as Error).message });
    }
  },

  materialize: async (event) => {
    const fd = await event.request.formData();
    const parsed = approvedPlanInput(fd);
    if (!parsed.ok) return fail(400, { ok: false, mode: "materialize", error: parsed.error });
    try {
      const workflowApi = createWebWorkflowApiCaller(event);
      if (!workflowApi) return fail(503, { ok: false, mode: "materialize", error: "Workflow API not configured" });
      const projectId = parsed.value.projectId ?? event.params.id;
      const metadata = workflowApiProjectMetadata(event, projectId);
      const materialized = await workflowApi.planning.materializeApprovedPlanBreakdown(
        apiInput({ ...metadata, ...parsed.value, projectId }),
      );
      return { ok: true, mode: "materialize", materialized };
    } catch (err) {
      return fail(400, { ok: false, mode: "materialize", error: (err as Error).message });
    }
  },
};
