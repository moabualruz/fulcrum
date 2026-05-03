import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listProfiles, testProfile, maskProfile } from "$lib/server/agents";
import { actionOk } from "$lib/feedback/action-result";

export const load: PageServerLoad = ({ locals }) => {
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const profiles = await listProfiles(db, orgId);
          return { profiles: profiles.map(maskProfile) };
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
    const db = await openProductDb();
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
};
