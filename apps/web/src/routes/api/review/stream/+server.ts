import type { RequestHandler } from "./$types";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { buildReviewWorkbenchModel } from "@planning-review/interface/project-review-reports.ts";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return new Response(sse("error", { error: "projectId required" }), {
      status: 400,
      headers: { "content-type": "text/event-stream" },
    });
  }

  const traceId = url.searchParams.get("traceId") ?? undefined;
  const reviewId = url.searchParams.get("reviewId") ?? undefined;
  const filePath = url.searchParams.get("file") ?? undefined;
  const lineStart = Number(url.searchParams.get("lineStart") ?? 0) || undefined;
  const lineEnd = Number(url.searchParams.get("lineEnd") ?? 0) || undefined;

  await requestServiceScope(locals, projectId);
  const model = await buildReviewWorkbenchModel({
    projectId,
    traceId,
    reviewId,
    files: [],
    annotations: [],
    selectedFilePath: filePath,
  });

  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(sse("review-started", {
        projectId,
        traceId,
        reviewId,
        filePath,
        lineStart,
        lineEnd,
      })));
      controller.enqueue(encoder.encode(sse("review-summary", {
        files: model.summary.fileCount,
        annotations: model.summary.annotationCount,
        blockers: model.summary.blockingAnnotationCount,
      })));
      controller.enqueue(encoder.encode(sse("done", { ok: true })));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
