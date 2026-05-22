import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createOrchestrationConfigApiForEvent } from "$lib/server/orchestration-config-api";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = (event) => {
  return {
    workflowId: event.params.id,
    activeProjectId: event.locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const api = createOrchestrationConfigApiForEvent(event);
        try {
          const workflow = await api.workflows.get({ id: event.params.id });
          return { workflow };
        } catch {
          throw error(404, "Workflow not found");
        }
      })(),
    },
  };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const name = (form.get("name") as string)?.trim();
    const description = (form.get("description") as string)?.trim() || null;
    const yamlConfig = (form.get("yaml_config") as string) ?? "";
    const promptTemplate = (form.get("prompt_template") as string) ?? "";

    if (!name) return fail(400, { error: "Name is required" });

    const api = createOrchestrationConfigApiForEvent(event);
    await api.workflows.save({
      id: event.params.id,
      name,
      description,
      yamlConfig,
      promptTemplate,
    });
    return actionOk("Workflow saved");
  },
};
