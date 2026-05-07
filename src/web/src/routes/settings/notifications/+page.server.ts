import type { PageServerLoad, Actions } from "./$types";
import { getRetentionPolicy, upsertRetentionPolicy } from "../../../../../application/audit/web-queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ locals }) => {
  const { em, ctx } = await requestAppScope(locals);
  const policy = await getRetentionPolicy(em, ctx.orgId);
  return {
    retainDays: policy?.retain_days ?? 0,
    saved: false,
  };
};

export const actions: Actions = {
  retention: async ({ request, locals }) => {
    const formData = await request.formData();
    const retainDays = parseInt(formData.get("retain_days")?.toString() ?? "0", 10);
    const { em, ctx } = await requestAppScope(locals);
    await upsertRetentionPolicy(em, ctx.orgId, isNaN(retainDays) ? 0 : retainDays);
    return { retainDays: isNaN(retainDays) ? 0 : retainDays, saved: true };
  },
};
