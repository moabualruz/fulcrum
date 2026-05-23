import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type ReviewWorkbenchSessionType = "plan" | "uat" | "code_review";
type UatCodeReviewDecision =
  | "start_uat"
  | "start_code_review"
  | "request_changes"
  | "approve_without_manual_review";
type ReviewAnnotationSeverity = "important" | "nit" | "pre_existing" | undefined;

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  try {
    const qaReport = await workflowApi(event).reports.finalQa({
      ...workflowApiProjectMetadata(event, projectId),
      projectId,
      taskIds: [],
    });
    return { projectId, qaReport };
  } catch (err) {
    if (err instanceof WorkflowApiError && err.status === 404) throw error(404, err.message);
    return {
      projectId,
      qaReport: null,
    };
  }
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of fd.entries()) out[key] = typeof value === "string" ? value : null;
  return out;
}

function csvIds(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

function parseJsonArray(value: string | null | undefined, label: string): unknown[] {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed;
}

function requiredInt(value: string | null | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function reviewSessionType(value: string | null | undefined): ReviewWorkbenchSessionType | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "plan" || normalized === "uat" || normalized === "code_review") return normalized;
  throw new Error(`Unsupported review session type: ${normalized}`);
}

function uatDecision(value: string | null | undefined): UatCodeReviewDecision {
  const normalized = value?.trim() || "approve_without_manual_review";
  if (
    normalized === "start_uat" ||
    normalized === "start_code_review" ||
    normalized === "request_changes" ||
    normalized === "approve_without_manual_review"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported UAT/code-review decision: ${normalized}`);
}

function reviewAnnotationSeverity(value: string | null | undefined): ReviewAnnotationSeverity {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "important" || normalized === "nit" || normalized === "pre_existing") return normalized;
  throw new Error(`Unsupported review annotation severity: ${normalized}`);
}

export const actions: Actions = {
  startReview: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewWorkbench = await workflowApi(event).reports.reviewWorkbench({
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        reviewId: raw["reviewId"]?.trim() || undefined,
        files: parseJsonArray(raw["filesJson"], "filesJson"),
        annotations: parseJsonArray(raw["annotationsJson"], "annotationsJson"),
        searchQuery: raw["searchQuery"]?.trim() || undefined,
      });
      return { ok: true, mode: "startReview", reviewWorkbench };
    } catch (err) {
      return fail(400, { ok: false, mode: "startReview", message: (err as Error).message });
    }
  },

  loadSession: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewSession = await workflowApi(event).reports.loadReviewWorkbenchSession({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        reviewId: raw["reviewId"]?.trim() || undefined,
        traceId: raw["traceId"]?.trim() || undefined,
      });
      return { ok: true, mode: "loadSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "loadSession", message: (err as Error).message });
    }
  },

  saveSession: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewSession = await workflowApi(event).reports.saveReviewWorkbenchSession({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        reviewId: raw["reviewId"]?.trim() || undefined,
        reviewType: reviewSessionType(raw["reviewType"]),
        title: raw["title"]?.trim() || undefined,
        files: parseJsonArray(raw["filesJson"], "filesJson"),
        annotations: parseJsonArray(raw["annotationsJson"], "annotationsJson"),
      });
      return { ok: true, mode: "saveSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "saveSession", message: (err as Error).message });
    }
  },

  annotate: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewSession = await workflowApi(event).reports.appendReviewWorkbenchAnnotation({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        reviewId: raw["reviewId"]?.trim() || undefined,
        traceId: raw["traceId"]?.trim() || undefined,
        filePath: raw["filePath"]?.trim() || "",
        lineStart: requiredInt(raw["lineStart"], "lineStart"),
        lineEnd: requiredInt(raw["lineEnd"], "lineEnd"),
        text: raw["body"]?.trim() || raw["text"]?.trim() || undefined,
        severity: reviewAnnotationSeverity(raw["severity"]),
      });
      return { ok: true, mode: "annotate", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "annotate", message: (err as Error).message });
    }
  },

  uatDecision: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const decision = await workflowApi(event).reports.recordUatCodeReviewDecision({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        decision: uatDecision(raw["decision"]),
        reviewType: "uat",
        feedbackText: raw["feedbackText"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"]),
      });
      return { ok: true, mode: "uatDecision", decision };
    } catch (err) {
      return fail(400, { ok: false, mode: "uatDecision", message: (err as Error).message });
    }
  },
};

function workflowApi(event: Parameters<typeof createWebWorkflowApiCaller>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
