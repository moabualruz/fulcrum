import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createScopedMemoryAction, listMemoryRows, MEMORY_SCOPES, type MemoryScope } from "@knowledge-workspace/interface/memory-records.ts";
import { requestServiceScope } from "$lib/server/request-service-scope";

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
        const { em, ctx } = await requestServiceScope(locals, activeProjectId);
        const memories = await listMemoryRows(em, ctx, {
          scope: scope && MEMORY_SCOPES.includes(scope as MemoryScope) ? scope as MemoryScope : undefined,
          kind: kind ? kind as Parameters<typeof listMemoryRows>[2]["kind"] : undefined,
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

    const projectId = locals?.activeProjectId ?? null;
    const { em, ctx } = await requestServiceScope(locals, projectId);
    const { id } = await createScopedMemoryAction(em, ctx, {
      projectId: scope === "global" ? null : ctx.projectId ?? null,
      scope: scope as MemoryScope,
      kind,
      key,
      body,
    });
    return { success: true, id };
  },
};
