import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createMemoryApiForEvent,
  memoryOrgId,
  MEMORY_SCOPES,
  toWebMemoryRow,
  type MemoryScope,
} from "$lib/server/memory-api";

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
  const activeProjectId = locals?.activeProjectId ?? null;
  const scope = (url.searchParams.get("scope") ?? "") as MemoryScope | "";
  const kind = url.searchParams.get("kind") ?? "";
  return {
    activeProjectId,
    scope,
    kind,
    streamed: {
      data: (async () => {
        const memoryApi = createMemoryApiForEvent(event);
        const validScope = scope && MEMORY_SCOPES.includes(scope as MemoryScope) ? scope as MemoryScope : undefined;
        const rows = await memoryApi.memories.list({
          global: validScope === "global" ? true : validScope === "project" ? false : undefined,
          kind: kind || undefined,
          projectId: validScope === "global" ? null : activeProjectId,
          limit: 100,
        }) as unknown[];
        const memories = rows.map((memory) => toWebMemoryRow(memory, memoryOrgId(event)));
        return { memories };
      })(),
    },
  };
};

export const actions: Actions = {
  create: async (event) => {
    const { request, locals } = event;
    const formData = await request.formData();
    const key = (formData.get("key") as string)?.trim();
    const body = (formData.get("body") as string)?.trim();
    const scope = (formData.get("scope") as string) || "project";
    const kind = (formData.get("kind") as string) || "fact";
    if (!key) return fail(400, { error: "Key is required" });
    if (!body) return fail(400, { error: "Body is required" });
    if (!MEMORY_SCOPES.includes(scope as MemoryScope)) return fail(400, { error: "Invalid scope" });

    const projectId = locals?.activeProjectId ?? null;
    const memoryApi = createMemoryApiForEvent(event);
    const { id } = await memoryApi.memories.create({
      projectId: scope === "global" ? null : projectId,
      global: scope === "global",
      kind,
      body,
      source: "manual",
      sourceRef: { key, scope },
    }) as { id: string };
    return { success: true, id };
  },
};
