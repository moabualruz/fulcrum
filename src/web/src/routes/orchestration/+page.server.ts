import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { loadOrchestrationDashboard } from "$lib/server/orchestration";
import { cancelRunAction, retryRunAction } from "$lib/server/runs";
import { actionOk } from "$lib/feedback/action-result";

interface ProjectOption {
  id: string;
  name: string;
}

export const load: PageServerLoad = ({ url, locals }) => {
  const projectFilter = url.searchParams.get("project") ?? "";

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    projectFilter,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const [dashboard, projects] = await Promise.all([
            loadOrchestrationDashboard(db, orgId, projectFilter || undefined),
            db.query<ProjectOption>(
              `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC`,
              [orgId],
            ),
          ]);
          return { ...dashboard, projects };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async ({ request }) => {
    const form = await request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await cancelRunAction(db, id, orgId);
      return actionOk("Run cancelled");
    } finally {
      await db.close();
    }
  },

  retry: async ({ request }) => {
    const form = await request.formData();
    const id = (form.get("run_id") as string | null) ?? "";
    if (!id) return { success: false, message: "run_id required" };
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await retryRunAction(db, id, orgId);
      return actionOk("Run queued for retry");
    } finally {
      await db.close();
    }
  },
};
