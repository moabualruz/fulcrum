import type { RequestEvent } from "@sveltejs/kit";
import { createMemoryApiForEvent } from "$lib/server/memory-api";
import { createProjectApiForEvent } from "$lib/server/project-api";
import { createTaskDetailApiForEvent } from "$lib/server/task-detail-api";

type ContextPreviewApiEvent = Pick<RequestEvent, "fetch" | "locals" | "request" | "url">;

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  title: string;
  status: string;
}

interface ContextPreviewResponse {
  bundle: unknown;
}

export function createContextPreviewApiForEvent(event: ContextPreviewApiEvent) {
  const memoryApi = createMemoryApiForEvent(event);
  const projectApi = createProjectApiForEvent(event);
  const taskApi = createTaskDetailApiForEvent(event);

  return {
    options: async (selectedProjectId: string | null): Promise<{ projects: ProjectOption[]; tasks: TaskOption[] }> => {
      // project-api.projects.list returns the public envelope `{ data: [...] }`
      // when public-api is on. Unwrap to a flat array so the <select> in
      // /context/preview can iterate it.
      const projectsResponse = await projectApi.projects.list() as { data?: ProjectOption[] } | ProjectOption[];
      const projects: ProjectOption[] = Array.isArray(projectsResponse)
        ? projectsResponse
        : projectsResponse.data ?? [];
      const tasks = selectedProjectId
        ? await taskApi.tasks.list({ projectId: selectedProjectId }) as TaskOption[]
        : [];
      return { projects, tasks: tasks.map(toTaskOption) };
    },
    bundle: async (input: { selectedProjectId: string | null; selectedTaskId: string }) => {
      const preview = await memoryApi.context.preview({
        taskId: input.selectedTaskId,
        projectId: input.selectedProjectId,
      }) as ContextPreviewResponse;
      return preview.bundle;
    },
  };
}

function toTaskOption(task: TaskOption): TaskOption {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
  };
}
