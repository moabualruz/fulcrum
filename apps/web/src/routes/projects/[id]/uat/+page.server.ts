import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import {
  buildUatCodeReviewHandoff,
  recordUatCodeReviewDecision,
  type UatCodeReviewDecision,
} from "@planning-review/interface/project-review-reports.ts";
import { ensureProjectExists } from "$lib/server/project-api";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const projectId = params.id;
  await ensureProjectExists(event, projectId);
  const { em, ctx } = await requestServiceScope(locals, projectId);
  try {
    const handoff = await buildUatCodeReviewHandoff(em, ctx, {
      projectId,
    });
    return { projectId, handoff };
  } catch (err) {
    if (err instanceof AppNotFoundError) throw error(404, err.message);
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
  decide: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw: Record<string, string | null> = {};
    for (const [key, value] of fd.entries()) raw[key] = typeof value === "string" ? value : null;

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

      if (decision.status === "approved") {
        return { ok: true, mode: "decide" as const, decision, redirectTo: `/projects/${params.id}/reports` };
      }
      if (decision.status === "changes_requested") {
        return { ok: true, mode: "decide" as const, decision, redirectTo: `/projects/${params.id}/review` };
      }

      return { ok: true, mode: "decide" as const, decision, redirectTo: null };
    } catch (err) {
      return fail(400, { ok: false, mode: "decide" as const, message: (err as Error).message });
    }
  },
};
