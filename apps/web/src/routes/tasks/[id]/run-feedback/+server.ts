import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { webWorkflowApiUrl } from "$lib/server/workflow-api";

export const GET: RequestHandler = async (event) => {
  const { url, params, locals } = event;
  const traceId = url.searchParams.get("traceId")?.trim() || url.searchParams.get("runGroupId")?.trim();
  const runGroupId = url.searchParams.get("runGroupId")?.trim() || traceId;
  const runId = url.searchParams.get("runId")?.trim() || undefined;
  if (!traceId && !runId) throw error(400, "traceId or runId is required");

  const projectId = locals?.activeProjectId ?? null;
  const publicStreamUrl = projectId ? webWorkflowApiUrl("/workflows/execution/dependency-run/live-feedback/stream", {
    projectId,
    traceId: traceId ?? undefined,
    runGroupId: runGroupId ?? undefined,
    runId,
    taskId: params.id,
    once: url.searchParams.get("once")?.trim() || undefined,
  }) : null;
  if (!publicStreamUrl) throw error(503, "workflow API stream is not configured");
  const upstream = await event.fetch(publicStreamUrl, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  if (!upstream.ok) throw error(upstream.status, await upstream.text());
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": upstream.headers.get("cache-control") ?? "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
