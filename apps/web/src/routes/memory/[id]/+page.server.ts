import { error, redirect, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getMemory, updateMemoryAction, deleteMemoryAction, MEMORY_SCOPES, type MemoryScope } from "@/application/memory/web-queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const { em, ctx } = await requestAppScope(locals);
      const mem = await getMemory(em, params.id, ctx.orgId);
      if (!mem) throw error(404, "Memory not found");
      return { memory: mem };
    })(),
  },
});

export const actions: Actions = {
  update: async ({ params, request }) => {
    const formData = await request.formData();
    const scope = formData.get("scope") as string | null;
    const body = formData.get("body") as string | null;
    const key = formData.get("key") as string | null;
    const kind = formData.get("kind") as string | null;

    const { em, ctx } = await requestAppScope(locals);
    const updates: Record<string, string> = {};
    if (scope && MEMORY_SCOPES.includes(scope as MemoryScope)) updates.scope = scope;
    if (body !== null && body !== undefined) updates.body = body;
    if (key) updates.key = key;
    if (kind) updates.kind = kind;
    if (Object.keys(updates).length === 0) return fail(400, { error: "No fields to update" });
    await updateMemoryAction(em, { id: params.id, orgId: ctx.orgId, ...updates } as Parameters<typeof updateMemoryAction>[1]);
    return { success: true };
  },
  delete: async ({ params, locals }) => {
    const { em, ctx } = await requestAppScope(locals);
    await deleteMemoryAction(em, params.id!, ctx.orgId);
    throw redirect(303, "/memory");
  },
};
