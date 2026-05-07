import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { cancelRun, retryRun } from "@/application/runs/commands.ts";
import { getProjectRunPageData } from "@/application/runs/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";
import { actionOk } from "$lib/feedback/action-result";

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

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, params.id);
        try {
          return await getProjectRunPageData(em, ctx, params.runId);
        } catch {
          throw error(404, "Run not found");
        }
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async ({ params, locals }) => {
    const { em, ctx } = await requestAppScope(locals, params.id);
    await cancelRun(em, ctx, params.runId!);
    return actionOk("Run cancelled");
  },
  retry: async ({ params, locals }) => {
    const { em, ctx } = await requestAppScope(locals, params.id);
    const result = await retryRun(em, ctx, params.runId!);
    const newId = result.id;
    throw redirect(303, `/projects/${params.id}/runs/${newId}`);
  },
};
