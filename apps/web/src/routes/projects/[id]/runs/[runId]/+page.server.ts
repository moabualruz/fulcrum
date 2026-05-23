import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { createAgentRunApiForEvent } from "$lib/server/agent-run-api";

interface AgentRunDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
  status: string;
  symphony_state: string | null;
  parent_run_id: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
  transcript_path: string | null;
  last_error_kind: string | null;
  retry_count: number;
  workspace_path: string | null;
}

interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  actor: string;
  created_at: string | Date;
}

export const load: PageServerLoad = (event) => {
  const { params, locals } = event;
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        try {
          return await createAgentRunApiForEvent(event).runs.pageDetail({
            id: params.runId,
            projectId: params.id,
          });
        } catch {
          throw error(404, "Run not found");
        }
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async (event) => {
    await createAgentRunApiForEvent(event).runs.cancel({ id: event.params.runId! });
    return actionOk("Run cancelled");
  },
  retry: async (event) => {
    const { params } = event;
    const result = await createAgentRunApiForEvent(event).runs.retry({ id: params.runId! }) as { id: string };
    const newId = result.id;
    throw redirect(303, `/projects/${params.id}/runs/${newId}`);
  },
  approvalDecision: async (event) => {
    const { request, params } = event;
    const form = await request.formData();
    const approvalId = String(form.get("approvalId") ?? "");
    const decision = String(form.get("decision") ?? "");
    if (decision !== "approve" && decision !== "deny" && decision !== "request_info") {
      throw error(400, "Invalid approval decision");
    }
    await createAgentRunApiForEvent(event).runs.recordApprovalDecision({
      id: params.runId!,
      projectId: params.id,
      approvalId,
      decision: decision as "approve" | "deny" | "request_info",
      note: String(form.get("note") ?? "") || null,
    });
    return actionOk("Approval decision recorded");
  },
};
