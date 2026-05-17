import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import {
  buildFinalQaReport,
  buildReviewWorkbenchModel,
  loadReviewWorkbenchSession,
  saveReviewWorkbenchSession,
  appendReviewWorkbenchAnnotation,
  recordUatCodeReviewDecision,
  type AppendReviewWorkbenchAnnotationInput,
  type ReviewWorkbenchSessionType,
  type UatCodeReviewDecision,
} from "@planning-review/interface/project-review-reports.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const projectId = params.id;
  const { em, ctx } = await requestServiceScope(locals, projectId);
  try {
    const qaReport = await buildFinalQaReport(em, ctx, {
      projectId,
      taskIds: [],
    });
    return { projectId, qaReport };
  } catch (err) {
    if (err instanceof AppNotFoundError) throw error(404, err.message);
    // Return empty state when no report data exists yet
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

function reviewAnnotationSeverity(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["severity"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "important" || normalized === "nit" || normalized === "pre_existing") return normalized;
  throw new Error(`Unsupported review annotation severity: ${normalized}`);
}

export const actions: Actions = {
  startReview: async ({ params, request }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewWorkbench = await buildReviewWorkbenchModel({
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        reviewId: raw["reviewId"]?.trim() || undefined,
        files: parseJsonArray(raw["filesJson"], "filesJson") as never,
        annotations: parseJsonArray(raw["annotationsJson"], "annotationsJson") as never,
        searchQuery: raw["searchQuery"]?.trim() || undefined,
      });
      return { ok: true, mode: "startReview", reviewWorkbench };
    } catch (err) {
      return fail(400, { ok: false, mode: "startReview", message: (err as Error).message });
    }
  },

  loadSession: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const reviewSession = await loadReviewWorkbenchSession(em, ctx, {
        projectId: params.id,
        reviewId: raw["reviewId"]?.trim() || undefined,
        traceId: raw["traceId"]?.trim() || undefined,
      });
      return { ok: true, mode: "loadSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "loadSession", message: (err as Error).message });
    }
  },

  saveSession: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const reviewSession = await saveReviewWorkbenchSession(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        reviewId: raw["reviewId"]?.trim() || undefined,
        reviewType: reviewSessionType(raw["reviewType"]),
        title: raw["title"]?.trim() || undefined,
        files: parseJsonArray(raw["filesJson"], "filesJson") as never,
        annotations: parseJsonArray(raw["annotationsJson"], "annotationsJson") as never,
      });
      return { ok: true, mode: "saveSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "saveSession", message: (err as Error).message });
    }
  },

  annotate: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const reviewSession = await appendReviewWorkbenchAnnotation(em, ctx, {
        projectId: params.id,
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

  uatDecision: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const decision = await recordUatCodeReviewDecision(em, ctx, {
        projectId: params.id,
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
