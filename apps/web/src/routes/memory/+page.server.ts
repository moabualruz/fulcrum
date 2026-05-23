import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  createMemoryApiForEvent,
  memoryOrgId,
  MEMORY_SCOPES,
  toWebMemoryRow,
  type MemoryScope,
} from "$lib/server/memory-api";
import { createProjectApiForEvent } from "$lib/server/project-api";

type ProjectListEntry = { id: string; slug?: string | null };

function unwrapMemoryProjectList(response: unknown): ProjectListEntry[] {
  if (Array.isArray(response)) return response as ProjectListEntry[];
  if (response && typeof response === "object" && Array.isArray((response as { data?: unknown }).data)) {
    return (response as { data: ProjectListEntry[] }).data;
  }
  return [];
}

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
        // Resolve slug → UUID so memory items created with the canonical project
        // UUID are still returned when the active project cookie is a slug.
        let resolvedProjectId: string | null = activeProjectId;
        if (activeProjectId && validScope !== "global") {
          const response = await createProjectApiForEvent(event).projects.list().catch(() => [] as unknown);
          const projects = unwrapMemoryProjectList(response);
          resolvedProjectId = projects.find(
            (project) => project.slug === activeProjectId || project.id === activeProjectId,
          )?.id ?? activeProjectId;
        }
        const rows = await memoryApi.memories.list({
          global: validScope === "global" ? true : validScope === "project" ? false : undefined,
          kind: kind || undefined,
          projectId: validScope === "global" ? null : resolvedProjectId,
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

    const activeProjectId = locals?.activeProjectId ?? null;
    let resolvedProjectId: string | null = activeProjectId;
    if (activeProjectId && scope !== "global") {
      const response = await createProjectApiForEvent(event).projects.list().catch(() => [] as unknown);
      const projects = unwrapMemoryProjectList(response);
      resolvedProjectId = projects.find(
        (project) => project.slug === activeProjectId || project.id === activeProjectId,
      )?.id ?? activeProjectId;
    }
    const memoryApi = createMemoryApiForEvent(event);
    const { id } = await memoryApi.memories.create({
      projectId: scope === "global" ? null : resolvedProjectId,
      global: scope === "global",
      kind,
      body,
      source: "manual",
      sourceRef: { key, scope },
    }) as { id: string };
    return { success: true, id };
  },
};
