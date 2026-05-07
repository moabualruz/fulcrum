import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { loadWorkflowDef } from "$lib/server/orchestration";
import { upsertWorkflowDef } from "../../../../../../../application/orchestration/commands.ts";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    workflowId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        const def = await loadWorkflowDef(em, ctx, params.id);
        if (!def) throw error(404, "Workflow not found");
        return { workflow: def };
      })(),
    },
  };
};

export const actions: Actions = {
  save: async ({ params, request, locals }) => {
    const form = await request.formData();
    const name = (form.get("name") as string)?.trim();
    const description = (form.get("description") as string)?.trim() || null;
    const yamlConfig = (form.get("yaml_config") as string) ?? "";
    const promptTemplate = (form.get("prompt_template") as string) ?? "";

    if (!name) return fail(400, { error: "Name is required" });

    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    await upsertWorkflowDef(em, ctx, {
      id: params.id,
      name,
      description,
      yamlConfig,
      promptTemplate,
    });
    return actionOk("Workflow saved");
  },
};
