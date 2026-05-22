import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createReportApiForEvent } from "$lib/server/report-api";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type GeneratedE2eRegressionRunner = "bun" | "playwright";
type ReviewWorkbenchSessionType = "plan" | "uat" | "code_review";
type UatCodeReviewDecision =
  | "start_uat"
  | "start_code_review"
  | "request_changes"
  | "approve_without_manual_review";
type UatCodeReviewSessionType = "uat" | "code_review";
type ReviewAnnotationType = "comment" | "suggestion" | "concern" | undefined;
type ReviewAnnotationScope = "line" | "file" | undefined;
type ReviewAnnotationSide = "old" | "new" | undefined;
type ReviewAnnotationSeverity = "important" | "nit" | "pre_existing" | undefined;
type ReviewAnnotationDecorations = ("blocking" | "non-blocking" | "if-minor")[] | undefined;

export const load: PageServerLoad = async (event) => {
  const sprintId = event.url.searchParams.get("sprint") ?? undefined;
  return await createReportApiForEvent(event).reports.projectPage({
    projectId: event.params.id,
    sprintId,
  });
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

function reviewAnnotationType(value: string | null | undefined): ReviewAnnotationType {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "comment" || normalized === "suggestion" || normalized === "concern") return normalized;
  throw new Error(`Unsupported review annotation type: ${normalized}`);
}

function reviewAnnotationScope(value: string | null | undefined): ReviewAnnotationScope {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "line" || normalized === "file") return normalized;
  throw new Error(`Unsupported review annotation scope: ${normalized}`);
}

function reviewAnnotationSide(value: string | null | undefined): ReviewAnnotationSide {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "old" || normalized === "new") return normalized;
  throw new Error(`Unsupported review annotation side: ${normalized}`);
}

function reviewAnnotationSeverity(value: string | null | undefined): ReviewAnnotationSeverity {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized === "important" || normalized === "nit" || normalized === "pre_existing") return normalized;
  throw new Error(`Unsupported review annotation severity: ${normalized}`);
}

function reviewAnnotationDecorations(value: string | null | undefined): ReviewAnnotationDecorations {
  const decorations = csvIds(value);
  if (decorations.length === 0) return undefined;
  for (const decoration of decorations) {
    if (decoration !== "blocking" && decoration !== "non-blocking" && decoration !== "if-minor") {
      throw new Error(`Unsupported review annotation decoration: ${decoration}`);
    }
  }
  return decorations as ReviewAnnotationDecorations;
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
  finalQa: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const report = await workflowApi(event).reports.finalQa({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "finalQa", report };
    } catch (err) {
      return fail(400, { ok: false, mode: "finalQa", message: (err as Error).message });
    }
  },
  finalQaGate: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const maxIterations = raw["maxIterations"]?.trim()
        ? requiredInt(raw["maxIterations"], "maxIterations")
        : undefined;
      const gate = await workflowApi(event).reports.finalQaFeedbackGate({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
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
  uatHandoff: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const handoff = await workflowApi(event).reports.uatCodeReviewHandoff({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "uatHandoff", handoff };
    } catch (err) {
      return fail(400, { ok: false, mode: "uatHandoff", message: (err as Error).message });
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
  autoDecision: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const autoDecision = await workflowApi(event).reports.applyConfiguredUatCodeReviewDecision({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"] ?? raw["taskId"]),
      });
      return { ok: true, mode: "autoDecision", autoDecision };
    } catch (err) {
      return fail(400, { ok: false, mode: "autoDecision", message: (err as Error).message });
    }
  },
  e2eRun: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const e2eRun = await workflowApi(event).reports.runGeneratedE2eRegressionTests({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        runner: e2eRunner(raw["runner"]),
        planOnly: raw["planOnly"] === "1" || raw["planOnly"] === "on",
      });
      return { ok: true, mode: "e2eRun", e2eRun };
    } catch (err) {
      return fail(400, { ok: false, mode: "e2eRun", message: (err as Error).message });
    }
  },
  reviewWorkbench: async (event) => {
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
  reviewSessionSave: async (event) => {
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
  reviewSessionLoad: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewSession = await workflowApi(event).reports.loadReviewWorkbenchSession({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
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
  reviewSessionAnnotate: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const reviewSession = await workflowApi(event).reports.appendReviewWorkbenchAnnotation({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
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

function workflowApi(event: Parameters<typeof createWebWorkflowApiCaller>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
