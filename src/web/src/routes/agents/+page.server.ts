import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { listProfiles, testProfile, maskProfile } from "$lib/server/agents";
import { dispatchRunAction } from "$lib/server/runs";
import { actionOk } from "$lib/feedback/action-result";

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  project_id: string | null;
  title: string;
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          const [profiles, projects, tasks] = await Promise.all([
            listProfiles(db, orgId).then((rows) => rows.map(maskProfile)),
            db.query<ProjectOption>(
              `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC`,
              [orgId],
            ),
            db.query<TaskOption>(
              `SELECT id, project_id, title FROM tasks WHERE org_id = $1 ORDER BY title ASC`,
              [orgId],
            ),
          ]);
          return { profiles, projects, tasks };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  test: async ({ request }) => {
    const form = await request.formData();
    const name = form.get("name") as string;
    if (!name) return { success: false, message: "Missing profile name" };
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const result = await testProfile(db, orgId, name);
      return actionOk(
        result.test_passed ? `${name}: test passed` : `${name}: test failed`,
      );
    } finally {
      await db.close();
    }
  },

  dispatch: async ({ request }) => {
    const form = await request.formData();
    const agent = (form.get("agent") as string | null) ?? "";
    const taskId = (form.get("task_id") as string | null) ?? "";
    const projectId = (form.get("project_id") as string | null) || null;
    if (!agent || !taskId)
      return { success: false, message: "agent and task_id are required" };
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const run = await dispatchRunAction(db, { orgId, projectId, taskId, agent });
      redirect(303, `/runs/${run.id}`);
    } finally {
      await db.close();
    }
  },
};
