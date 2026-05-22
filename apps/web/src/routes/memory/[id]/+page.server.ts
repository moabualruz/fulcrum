import { error, redirect, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createMemoryApiForEvent,
  memoryOrgId,
  MEMORY_SCOPES,
  toWebMemoryRow,
  type MemoryScope,
} from "$lib/server/memory-api";

export const load: PageServerLoad = (event) => ({
  activeProjectId: event.locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const mem = await createMemoryApiForEvent(event).memories.get({ id: event.params.id });
      if (!mem) throw error(404, "Memory not found");
      return { memory: toWebMemoryRow(mem, memoryOrgId(event)) };
    })(),
  },
});

export const actions: Actions = {
  update: async (event) => {
    const { params, request } = event;
    const formData = await request.formData();
    const scope = formData.get("scope") as string | null;
    const body = formData.get("body") as string | null;
    const key = formData.get("key") as string | null;
    const kind = formData.get("kind") as string | null;

    const updates: Record<string, unknown> = {};
    if (scope && MEMORY_SCOPES.includes(scope as MemoryScope)) updates.scope = scope;
    if (body !== null && body !== undefined) updates.body = body;
    if (key) updates.key = key;
    if (kind) updates.kind = kind;
    if (Object.keys(updates).length === 0) return fail(400, { error: "No fields to update" });
    await createMemoryApiForEvent(event).memories.update({ id: params.id, ...updates });
    return { success: true };
  },
  delete: async (event) => {
    await createMemoryApiForEvent(event).memories.delete({ id: event.params.id });
    throw redirect(303, "/memory");
  },
};
