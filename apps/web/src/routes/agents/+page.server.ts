import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listAgentProfilesPageData, testProfile } from "@/application/agents/queries.ts";
import { dispatchTaskRun } from "@/application/runs/commands.ts";
import { requestAppScope } from "$lib/server/application-scope";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals);
        return listAgentProfilesPageData(em, ctx);
      })(),
    },
  };
};

export const actions: Actions = {
  test: async ({ request }) => {
    const form = await request.formData();
    const name = form.get("name") as string;
    if (!name) return { success: false, message: "Missing profile name" };
    const { em, ctx } = await requestAppScope(locals);
    const result = await testProfile(em, ctx.orgId, name);
    return actionOk(
      result.test_passed ? `${name}: test passed` : `${name}: test failed`,
    );
  },

  dispatch: async ({ request, locals }) => {
    const form = await request.formData();
    const agent = (form.get("agent") as string | null) ?? "";
    const taskId = (form.get("task_id") as string | null) ?? "";
    const projectId = (form.get("project_id") as string | null) || null;
    if (!agent || !taskId)
      return { success: false, message: "agent and task_id are required" };
    const { em, ctx } = await requestAppScope(locals, projectId);
    const run = await dispatchTaskRun(em, ctx, { taskId, agent });
    throw redirect(303, `/runs/${run.id}`);
  },
};
