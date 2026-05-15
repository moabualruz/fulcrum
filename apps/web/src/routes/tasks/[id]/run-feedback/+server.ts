import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  dependencyRunLiveFeedbackTopic,
  loadDependencyRunLiveFeedbackForTasks,
  type DependencyRunLiveFeedbackOutput,
  DependencyRunLiveFeedbackOutputSchema,
} from "@execution-orchestration/interface/dependency-run-live-feedback.ts";
import { subscribeToProcessEvent } from "@platform-core/interface/subscription-events.ts";
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
  if (publicStreamUrl) {
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
  }

  const { em, ctx } = await requestScopedApp(locals, locals?.activeProjectId ?? null, params.id);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        unsubscribe?.();
        unsubscribe = null;
        controller.close();
      };
      const send = (feedback: DependencyRunLiveFeedbackOutput) => {
        controller.enqueue(encoder.encode(`event: feedback\ndata: ${JSON.stringify(feedback)}\n\n`));
      };

      const initial = await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
        traceId: traceId ?? undefined,
        runGroupId: runGroupId ?? undefined,
        runId,
        taskId: params.id,
      });
      send(initial);

      if (!initial.executorStatus.active || url.searchParams.get("once") === "1") {
        close();
        return;
      }

      const topic = dependencyRunLiveFeedbackTopic({
        orgId: ctx.orgId,
        projectId: initial.projectId,
        traceId: initial.traceId,
      });
      unsubscribe = await subscribeToProcessEvent<DependencyRunLiveFeedbackOutput>(topic, (event) => {
        const feedback = DependencyRunLiveFeedbackOutputSchema.parse(event.payload);
        send(feedback);
        if (!feedback.executorStatus.active) close();
      });
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

async function requestScopedApp(locals: App.Locals, projectId?: string | null, taskId?: string) {
  const { requestAppScope } = await import("$lib/server/application-scope");
  return requestAppScope(locals, projectId, taskId);
}
