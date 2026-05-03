import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import {
  loadOrchestrationConfig,
  upsertOrchestrationConfig,
  listWorkflowDefs,
} from "$lib/server/orchestration";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const config = await loadOrchestrationConfig(db, orgId);
          const workflows = await listWorkflowDefs(db, orgId);
          return {
            config: config ?? {
              poll_interval_s: 5,
              max_concurrency: 4,
              stall_timeout_s: 300,
              workspace_root: null,
            },
            workflows,
          };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();
    const pollIntervalS = Number(form.get("poll_interval_s") ?? 5);
    const maxConcurrency = Number(form.get("max_concurrency") ?? 4);
    const stallTimeoutS = Number(form.get("stall_timeout_s") ?? 300);
    const workspaceRoot = (form.get("workspace_root") as string)?.trim() || null;

    if (pollIntervalS < 1 || pollIntervalS > 3600)
      return fail(400, { error: "Poll interval must be 1-3600s" });
    if (maxConcurrency < 1 || maxConcurrency > 64)
      return fail(400, { error: "Max concurrency must be 1-64" });
    if (stallTimeoutS < 10 || stallTimeoutS > 86400)
      return fail(400, { error: "Stall timeout must be 10-86400s" });

    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await upsertOrchestrationConfig(db, orgId, {
        pollIntervalS,
        maxConcurrency,
        stallTimeoutS,
        workspaceRoot,
      });
    } finally {
      await db.close();
    }
    return actionOk("Orchestration config saved");
  },
};
