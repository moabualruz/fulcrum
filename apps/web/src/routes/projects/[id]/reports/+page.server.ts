import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import {
  appendReviewWorkbenchAnnotation,
  applyConfiguredUatCodeReviewDecision,
  buildFinalQaFeedbackGate,
  buildFinalQaReport,
  buildReviewWorkbenchModel,
  buildUatCodeReviewHandoff,
  loadReviewWorkbenchSession,
  recordUatCodeReviewDecision,
  runGeneratedE2eRegressionTests,
  saveReviewWorkbenchSession,
  type AppendReviewWorkbenchAnnotationInput,
  type GeneratedE2eRegressionRunner,
  type ReviewWorkbenchSessionType,
  type UatCodeReviewDecision,
  type UatCodeReviewSessionType,
} from "@planning-review/interface/project-review-reports.ts";
import { loadProjectReportsPage } from "@work-management/interface/project-reports.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const sprintId = url.searchParams.get("sprint") ?? undefined;
  const { em, ctx } = await requestServiceScope(locals, params.id);
  try {
    return await loadProjectReportsPage(em, ctx, { projectId: params.id, sprintId });
  } catch (err) {
    if (err instanceof AppNotFoundError) throw error(404, err.message);
    throw err;
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

function uatReviewType(value: string | null | undefined): UatCodeReviewSessionType {
  const normalized = value?.trim() || "uat";
  if (normalized === "uat" || normalized === "code_review") return normalized;
  throw new Error(`Unsupported UAT/code-review type: ${normalized}`);
}

function e2eRunner(value: string | null | undefined): GeneratedE2eRegressionRunner | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "bun" || normalized === "playwright") return normalized;
  throw new Error(`Unsupported generated E2E runner: ${normalized}`);
}

function reviewSessionType(value: string | null | undefined): ReviewWorkbenchSessionType | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "plan" || normalized === "uat" || normalized === "code_review") return normalized;
  throw new Error(`Unsupported review session type: ${normalized}`);
}

function reviewAnnotationType(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["type"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "comment" || normalized === "suggestion" || normalized === "concern") return normalized;
  throw new Error(`Unsupported review annotation type: ${normalized}`);
}

function reviewAnnotationScope(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["scope"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "line" || normalized === "file") return normalized;
  throw new Error(`Unsupported review annotation scope: ${normalized}`);
}

function reviewAnnotationSide(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["side"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "old" || normalized === "new") return normalized;
  throw new Error(`Unsupported review annotation side: ${normalized}`);
}

function reviewAnnotationSeverity(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["severity"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "important" || normalized === "nit" || normalized === "pre_existing") return normalized;
  throw new Error(`Unsupported review annotation severity: ${normalized}`);
}

function reviewAnnotationDecorations(value: string | null | undefined): AppendReviewWorkbenchAnnotationInput["decorations"] {
  const decorations = csvIds(value);
  if (decorations.length === 0) return undefined;
  for (const decoration of decorations) {
    if (decoration !== "blocking" && decoration !== "non-blocking" && decoration !== "if-minor") {
      throw new Error(`Unsupported review annotation decoration: ${decoration}`);
    }
  }
  return decorations as AppendReviewWorkbenchAnnotationInput["decorations"];
}

function requiredInt(value: string | null | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function parseJsonArray(value: string | null | undefined, label: string): unknown[] {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed;
}

export const actions: Actions = {
  finalQa: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const report = await buildFinalQaReport(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "finalQa", report };
    } catch (err) {
      return fail(400, { ok: false, mode: "finalQa", message: (err as Error).message });
    }
  },
  finalQaGate: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const maxIterations = raw["maxIterations"]?.trim()
        ? requiredInt(raw["maxIterations"], "maxIterations")
        : undefined;
      const gate = await buildFinalQaFeedbackGate(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
        workerId: raw["workerId"]?.trim() || undefined,
        reviewerAgent: raw["reviewerAgent"]?.trim() || undefined,
        feedbackAgent: raw["feedbackAgent"]?.trim() || undefined,
        feedbackModel: raw["feedbackModel"]?.trim() || undefined,
        maxIterations,
        cwd: raw["cwd"]?.trim() || undefined,
        copyToWorktree: csvIds(raw["copyToWorktree"]),
      });
      return { ok: true, mode: "finalQaGate", gate };
    } catch (err) {
      return fail(400, { ok: false, mode: "finalQaGate", message: (err as Error).message });
    }
  },
  uatHandoff: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const handoff = await buildUatCodeReviewHandoff(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "uatHandoff", handoff };
    } catch (err) {
      return fail(400, { ok: false, mode: "uatHandoff", message: (err as Error).message });
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
        reviewType: uatReviewType(raw["reviewType"]),
        feedbackText: raw["feedbackText"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
        e2eRunner: e2eRunner(raw["e2eRunner"]),
      });
      return { ok: true, mode: "uatDecision", decision };
    } catch (err) {
      return fail(400, { ok: false, mode: "uatDecision", message: (err as Error).message });
    }
  },
  autoDecision: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const autoDecision = await applyConfiguredUatCodeReviewDecision(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "autoDecision", autoDecision };
    } catch (err) {
      return fail(400, { ok: false, mode: "autoDecision", message: (err as Error).message });
    }
  },
  e2eRun: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const e2eRun = await runGeneratedE2eRegressionTests(em, ctx, {
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        runner: e2eRunner(raw["runner"]),
        planOnly: raw["planOnly"] === "1" || raw["planOnly"] === "on",
      });
      return { ok: true, mode: "e2eRun", e2eRun };
    } catch (err) {
      return fail(400, { ok: false, mode: "e2eRun", message: (err as Error).message });
    }
  },
  reviewWorkbench: async ({ params, request }) => {
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
        selectedFilePath: raw["selectedFilePath"]?.trim() || undefined,
        viewedFilePaths: csvIds(raw["viewedFilePaths"]),
        hideViewedFiles: raw["hideViewedFiles"] === "1" || raw["hideViewedFiles"] === "on",
        activeSearchMatchId: raw["activeSearchMatchId"]?.trim() || undefined,
        liveLog: raw["liveLog"] != null
          ? {
            content: raw["liveLog"] ?? "",
            isLive: raw["liveLogIsLive"] === "1" || raw["liveLogIsLive"] === "on",
          }
          : undefined,
      });
      return { ok: true, mode: "reviewWorkbench", reviewWorkbench };
    } catch (err) {
      return fail(400, { ok: false, mode: "reviewWorkbench", message: (err as Error).message });
    }
  },
  reviewSessionSave: async ({ params, request, locals }) => {
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
        searchQuery: raw["searchQuery"]?.trim() || undefined,
        selectedFilePath: raw["selectedFilePath"]?.trim() || undefined,
        viewedFilePaths: csvIds(raw["viewedFilePaths"]),
        hideViewedFiles: raw["hideViewedFiles"] === "1" || raw["hideViewedFiles"] === "on",
        activeSearchMatchId: raw["activeSearchMatchId"]?.trim() || undefined,
        liveLog: raw["liveLog"] != null
          ? {
            content: raw["liveLog"] ?? "",
            isLive: raw["liveLogIsLive"] === "1" || raw["liveLogIsLive"] === "on",
          }
          : undefined,
      });
      return { ok: true, mode: "reviewSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "reviewSession", message: (err as Error).message });
    }
  },
  reviewSessionLoad: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const reviewSession = await loadReviewWorkbenchSession(em, ctx, {
        projectId: params.id,
        reviewId: raw["reviewId"]?.trim() || undefined,
        traceId: raw["traceId"]?.trim() || undefined,
        searchQuery: raw["searchQuery"]?.trim() || undefined,
        selectedFilePath: raw["selectedFilePath"]?.trim() || undefined,
        viewedFilePaths: csvIds(raw["viewedFilePaths"]),
        hideViewedFiles: raw["hideViewedFiles"] === "1" || raw["hideViewedFiles"] === "on",
        activeSearchMatchId: raw["activeSearchMatchId"]?.trim() || undefined,
      });
      return { ok: true, mode: "reviewSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "reviewSession", message: (err as Error).message });
    }
  },
  reviewSessionAnnotate: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const reviewSession = await appendReviewWorkbenchAnnotation(em, ctx, {
        projectId: params.id,
        reviewId: raw["reviewId"]?.trim() || undefined,
        traceId: raw["traceId"]?.trim() || undefined,
        annotationId: raw["annotationId"]?.trim() || undefined,
        type: reviewAnnotationType(raw["type"]),
        scope: reviewAnnotationScope(raw["scope"]),
        filePath: raw["filePath"]?.trim() || "",
        lineStart: requiredInt(raw["lineStart"], "lineStart"),
        lineEnd: requiredInt(raw["lineEnd"], "lineEnd"),
        side: reviewAnnotationSide(raw["side"]),
        text: raw["annotationText"]?.trim() || raw["text"]?.trim() || undefined,
        suggestedCode: raw["suggestedCode"]?.trim() || undefined,
        originalCode: raw["originalCode"]?.trim() || undefined,
        severity: reviewAnnotationSeverity(raw["severity"]),
        conventionalLabel: raw["conventionalLabel"]?.trim() || undefined,
        decorations: reviewAnnotationDecorations(raw["decorations"]),
        author: raw["author"]?.trim() || undefined,
        source: raw["source"]?.trim() || undefined,
        selectedFilePath: raw["selectedFilePath"]?.trim() || undefined,
        viewedFilePaths: csvIds(raw["viewedFilePaths"]),
        hideViewedFiles: raw["hideViewedFiles"] === "1" || raw["hideViewedFiles"] === "on",
        searchQuery: raw["searchQuery"]?.trim() || undefined,
        activeSearchMatchId: raw["activeSearchMatchId"]?.trim() || undefined,
      });
      return { ok: true, mode: "reviewSession", reviewSession };
    } catch (err) {
      return fail(400, { ok: false, mode: "reviewSession", message: (err as Error).message });
    }
  },
};
