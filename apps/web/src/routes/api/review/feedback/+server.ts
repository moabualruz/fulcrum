import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createWebWorkflowApiCaller } from "$lib/server/workflow-api";

export const POST: RequestHandler = async (event) => {
  const { request, locals } = event;
  const body = await request.json();
  const { projectId, traceId, reviewId, annotations, verdict } = body as {
    projectId?: string;
    traceId?: string;
    reviewId?: string;
    annotations?: Array<{
      filePath: string;
      lineStart: number;
      lineEnd: number;
      text: string;
      type?: string;
      severity?: string;
      suggestedCode?: string;
    }>;
    verdict?: "approve" | "request_changes" | "send_feedback";
  };

  if (!projectId) return json({ error: "projectId required" }, { status: 400 });

  const api = createWebWorkflowApiCaller(event);
  if (!api) return json({ error: "workflow API is not configured" }, { status: 503 });

  const results = [];
  for (const ann of annotations ?? []) {
    const result = await api.workflows.appendReviewWorkbenchAnnotation({
      orgId: locals.orgId ?? undefined,
      userId: locals.userId ?? undefined,
      projectId,
      traceId: traceId ?? `trace-${Date.now()}`,
      reviewId: reviewId ?? `review-${Date.now()}`,
      annotation: {
        filePath: ann.filePath,
        lineStart: ann.lineStart,
        lineEnd: ann.lineEnd,
        text: ann.text ?? "",
        type: ann.type ?? "comment",
        severity: ann.severity,
        suggestedCode: ann.suggestedCode,
      },
    });
    results.push(result);
  }

  return json({
    ok: true,
    verdict: verdict ?? "send_feedback",
    annotationCount: results.length,
    traceId,
    reviewId,
  });
};
