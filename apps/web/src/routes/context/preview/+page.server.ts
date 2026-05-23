import type { PageServerLoad } from "./$types";
import { createContextPreviewApiForEvent } from "$lib/server/context-preview-api";
import { createProjectApiForEvent } from "$lib/server/project-api";

type ProjectListEntry = { id: string; slug?: string | null };

function unwrapContextProjectList(response: unknown): ProjectListEntry[] {
  if (Array.isArray(response)) return response as ProjectListEntry[];
  if (response && typeof response === "object" && Array.isArray((response as { data?: unknown }).data)) {
    return (response as { data: ProjectListEntry[] }).data;
  }
  return [];
}

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
  const activeProjectId = locals?.activeProjectId ?? null;
  const selectedProjectId = url.searchParams.get("projectId") || activeProjectId;
  const selectedTaskId = url.searchParams.get("taskId") || null;
  const contextPreviewApi = createContextPreviewApiForEvent(event);

  return {
    activeProjectId,
    selectedProjectId,
    selectedTaskId,
    streamed: {
      options: (async () => {
        // Resolve slug → UUID so the task list query lands on the canonical
        // project_id, otherwise the dropdown shows zero tasks when the active
        // project is a slug.
        let resolvedProjectId = selectedProjectId;
        if (resolvedProjectId) {
          const response = await createProjectApiForEvent(event).projects.list().catch(() => [] as unknown);
          const projects = unwrapContextProjectList(response);
          const slugOrId = resolvedProjectId;
          resolvedProjectId = projects.find(
            (project) => project.slug === slugOrId || project.id === slugOrId,
          )?.id ?? resolvedProjectId;
        }
        return contextPreviewApi.options(resolvedProjectId);
      })(),
      bundle: selectedTaskId
        ? (async () => {
            return contextPreviewApi.bundle({ selectedProjectId, selectedTaskId });
          })()
        : null,
    },
  };
};
