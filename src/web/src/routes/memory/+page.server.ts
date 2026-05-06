import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { memoryApplicationScope } from "../../../../application/memory/queries.ts";
import { listMemories, createMemoryAction, type MemoryScope, MEMORY_SCOPES } from "$lib/server/memory";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

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
        const em = locals.em ?? await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const ctx = memoryApplicationScope({ orgId, userId: null, projectId: activeProjectId });
        const memories = await listMemories(em, {
          orgId: ctx.orgId,
          scope: scope && MEMORY_SCOPES.includes(scope as MemoryScope) ? scope as MemoryScope : undefined,
          kind: kind || undefined,
          projectId: ctx.projectId,
        });
        return { memories };
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

    const em = locals.em ?? await getEm();
    const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
    const projectId = locals?.activeProjectId ?? null;
    const ctx = memoryApplicationScope({ orgId, userId: null, projectId });
    const { id } = await createMemoryAction(em, {
      orgId: ctx.orgId,
      projectId: scope === "global" ? null : ctx.projectId ?? null,
      scope: scope as MemoryScope,
      kind,
      key,
      body,
    });
    return { success: true, id };
  },
};
