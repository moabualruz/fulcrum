import type { RequestHandler } from "./$types";
import {
  createSubscriptionEvent,
  formatSubscriptionServerSentEvent,
} from "@platform-core/application/subscriptions/event-bus.ts";
import { createWebWorkflowApiCaller } from "$lib/server/workflow-api";

function sse(type: string, traceId: string | undefined, payload: unknown): string {
  return formatSubscriptionServerSentEvent(createSubscriptionEvent({
    topic: `review.${traceId ?? "draft"}.${type}`,
    type,
    traceId: traceId ?? null,
    payload,
  }));
}

export const GET: RequestHandler = async (event) => {
  const { url } = event;
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return new Response(sse("error", undefined, { error: "projectId required" }), {
      status: 400,
      headers: { "content-type": "text/event-stream" },
    });
  }

  const traceId = url.searchParams.get("traceId") ?? undefined;
  const reviewId = url.searchParams.get("reviewId") ?? undefined;
  const filePath = url.searchParams.get("file") ?? undefined;
  const lineStart = Number(url.searchParams.get("lineStart") ?? 0) || undefined;
  const lineEnd = Number(url.searchParams.get("lineEnd") ?? 0) || undefined;

  const api = createWebWorkflowApiCaller(event);
  if (!api) {
    return new Response(sse("error", traceId, { error: "workflow API is not configured" }), {
      status: 503,
      headers: { "content-type": "text/event-stream" },
    });
  }
  const reviewSession = reviewId || traceId
    ? await api.reports.loadReviewWorkbenchSession({
      projectId,
      traceId,
      reviewId,
      selectedFilePath: filePath,
    }).catch((err) => err as Error)
    : null;
  if (reviewSession instanceof Error) {
    const status = reviewSession.message.toLowerCase().includes("not found") ? 404 : 400;
    return new Response(sse("error", traceId, { error: reviewSession.message }), {
      status,
      headers: { "content-type": "text/event-stream" },
    });
  }
  const model = reviewSession?.model ?? await api.reports.reviewWorkbench({
    projectId,
    files: [],
    annotations: [],
    selectedFilePath: filePath,
  });

  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(sse("review-started", traceId, {
        projectId,
        traceId,
        reviewId,
        persisted: Boolean(reviewSession),
        revision: reviewSession?.revision ?? null,
        filePath,
        lineStart,
        lineEnd,
      })));
      controller.enqueue(encoder.encode(sse("review-summary", traceId, {
        files: model.summary.fileCount,
        annotations: model.summary.annotationCount,
        blockers: model.summary.blockingAnnotationCount,
      })));
      controller.enqueue(encoder.encode(sse("done", traceId, { ok: true })));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-fulcrum-reconnect": "send-last-event-id",
    },
  });
};
