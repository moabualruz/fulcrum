import type { PageServerLoad } from "./$types";
import { createTaskDetailApiForEvent } from "$lib/server/task-detail-api";

// `/tasks` lists every task in the active workspace (optionally scoped to the
// active project). This index complements `/tasks/<id>` (single task detail)
// and matches the Build-stage nav entry in `apps/web/src/lib/components/app/nav-data.ts`.
export const load: PageServerLoad = async (event) => {
  const parentData =
    typeof event.parent === "function"
      ? await event.parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const projectKey = event.url.searchParams.get("project") ?? parentData.activeProjectId ?? "";
  const api = createTaskDetailApiForEvent(event);
  return {
    project: projectKey,
    activeProjectId: parentData.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const tasks = await api.tasks.list(projectKey ? { projectId: projectKey } : {});
        return { tasks };
      })(),
    },
  };
};
