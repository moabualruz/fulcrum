import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { loadWorkflowDef, upsertWorkflowDef } from "$lib/server/orchestration";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    workflowId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const def = await loadWorkflowDef(db, orgId, params.id);
          if (!def) throw error(404, "Workflow not found");
          return { workflow: def };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  save: async ({ params, request }) => {
    const form = await request.formData();
    const name = (form.get("name") as string)?.trim();
    const description = (form.get("description") as string)?.trim() || null;
    const yamlConfig = (form.get("yaml_config") as string) ?? "";
    const promptTemplate = (form.get("prompt_template") as string) ?? "";

    if (!name) return fail(400, { error: "Name is required" });

    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await upsertWorkflowDef(db, orgId, {
        id: params.id,
        name,
        description,
        yamlConfig,
        promptTemplate,
      });
    } finally {
      await db.close();
    }
    return actionOk("Workflow saved");
  },
};
