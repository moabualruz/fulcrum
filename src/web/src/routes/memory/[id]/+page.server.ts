import { error, redirect, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { getMemory, updateMemoryAction, deleteMemoryAction, MEMORY_SCOPES, type MemoryScope } from "$lib/server/memory";

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openDatabase();
      try {
        const orgId = await getDefaultOrgId(db);
        const mem = await getMemory(db, params.id, orgId);
        if (!mem) throw error(404, "Memory not found");
        return { memory: mem };
      } finally {
        await db.close();
      }
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

    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const updates: Record<string, string> = {};
      if (scope && MEMORY_SCOPES.includes(scope as MemoryScope)) updates.scope = scope;
      if (body !== null && body !== undefined) updates.body = body;
      if (key) updates.key = key;
      if (kind) updates.kind = kind;
      if (Object.keys(updates).length === 0) return fail(400, { error: "No fields to update" });
      await updateMemoryAction(db, { id: params.id, orgId, ...updates } as Parameters<typeof updateMemoryAction>[1]);
      return { success: true };
    } finally {
      await db.close();
    }
  },
  delete: async ({ params }) => {
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      await deleteMemoryAction(db, params.id!, orgId);
    } finally {
      await db.close();
    }
    throw redirect(303, "/memory");
  },
};
