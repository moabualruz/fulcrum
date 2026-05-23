import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { WorkflowApiError } from "@workflow-coordination/interface/http/workflow-api-client";
import { ensureProjectExists } from "$lib/server/project-api";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type UatCodeReviewDecision =
  | "start_uat"
  | "start_code_review"
  | "request_changes"
  | "approve_without_manual_review";

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  await ensureProjectExists(event, projectId);
  try {
    const handoff = await workflowApi(event).reports.uatCodeReviewHandoff({
      ...workflowApiProjectMetadata(event, projectId),
      projectId,
    });
    return { projectId, handoff };
  } catch (err) {
    if (err instanceof WorkflowApiError && err.status === 404) throw error(404, err.message);
    return {
      projectId,
      handoff: null,
    };
  }
};

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
  throw new Error(`Unsupported UAT decision: ${normalized}`);
}

function csvIds(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

export const actions: Actions = {
  decide: async (event) => {
    const fd = await event.request.formData();
    const raw: Record<string, string | null> = {};
    for (const [key, value] of fd.entries()) raw[key] = typeof value === "string" ? value : null;

    try {
      const decision = await workflowApi(event).reports.recordUatCodeReviewDecision({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
        decision: uatDecision(raw["decision"]),
        reviewType: "uat",
        feedbackText: raw["feedbackText"]?.trim() || undefined,
        taskIds: csvIds(raw["taskIds"]),
      }) as { status: string };

      if (decision.status === "approved") {
        return { ok: true, mode: "decide" as const, decision, redirectTo: `/projects/${event.params.id}/reports` };
      }
      if (decision.status === "changes_requested") {
        return { ok: true, mode: "decide" as const, decision, redirectTo: `/projects/${event.params.id}/review` };
      }

      return { ok: true, mode: "decide" as const, decision, redirectTo: null };
    } catch (err) {
      return fail(400, { ok: false, mode: "decide" as const, message: (err as Error).message });
    }
  },
};

function workflowApi(event: Parameters<PageServerLoad>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
