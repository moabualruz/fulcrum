import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { listMemories, createMemoryAction, type MemoryScope, MEMORY_SCOPES } from "$lib/server/memory";

export const load: PageServerLoad = ({ url, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const scope = (url.searchParams.get("scope") ?? "") as MemoryScope | "";
  const kind = url.searchParams.get("kind") ?? "";
  return {
    activeProjectId,
    scope,
    kind,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const memories = await listMemories(db, {
            orgId,
            scope: scope && MEMORY_SCOPES.includes(scope as MemoryScope) ? scope as MemoryScope : undefined,
            kind: kind || undefined,
            projectId: activeProjectId,
          });
          return { memories };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const key = (formData.get("key") as string)?.trim();
    const body = (formData.get("body") as string)?.trim();
    const scope = (formData.get("scope") as string) || "project";
    const kind = (formData.get("kind") as string) || "fact";
    if (!key) return fail(400, { error: "Key is required" });
    if (!body) return fail(400, { error: "Body is required" });
    if (!MEMORY_SCOPES.includes(scope as MemoryScope)) return fail(400, { error: "Invalid scope" });

    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const projectId = locals?.activeProjectId ?? null;
      const { id } = await createMemoryAction(db, {
        orgId,
        projectId: scope === "global" ? null : projectId,
        scope: scope as MemoryScope,
        kind,
        key,
        body,
      });
      return { success: true, id };
    } finally {
      await db.close();
    }
  },
};
