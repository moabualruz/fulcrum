import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";

export const GET: RequestHandler = async ({ url, locals }) => {
  const projectId = url.searchParams.get("projectId");
  const traceId = url.searchParams.get("traceId");
  const reviewId = url.searchParams.get("reviewId");

  if (!projectId) return json({ error: "projectId required" }, { status: 400 });

  const { em, ctx } = await requestServiceScope(locals, projectId);

  const { buildReviewWorkbenchModel } = await import(
    "@planning-review/application/reviews/review-workbench.ts"
  );

  const model = buildReviewWorkbenchModel({
    projectId,
    traceId: traceId ?? undefined,
    reviewId: reviewId ?? undefined,
    files: [],
    annotations: [],
    searchQuery: "",
  });

  return json({
    projectId,
    traceId,
    reviewId,
    files: model.files,
    fileTree: model.fileTree,
    summary: model.summary,
  });
};
