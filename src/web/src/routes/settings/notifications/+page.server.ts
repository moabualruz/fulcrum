import type { PageServerLoad, Actions } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { getRetentionPolicy, upsertRetentionPolicy } from "$lib/server/audit";

export const load: PageServerLoad = async () => {
  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);
    const policy = await getRetentionPolicy(db, orgId);
    return {
      retainDays: policy?.retain_days ?? 0,
      saved: false,
    };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  retention: async ({ request }) => {
    const formData = await request.formData();
    const retainDays = parseInt(formData.get("retain_days")?.toString() ?? "0", 10);
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      await upsertRetentionPolicy(db, orgId, isNaN(retainDays) ? 0 : retainDays);
      return { retainDays: isNaN(retainDays) ? 0 : retainDays, saved: true };
    } finally {
      await db.close();
    }
  },
};
