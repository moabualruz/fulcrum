import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { dispatchRun } from "../../../../application/runs/commands.ts";
import { listRuns } from "../../../../application/runs/queries.ts";
import { listTasks } from "../../../../application/tasks/queries.ts";
import {
  applyRunsFilters,
  type RunRange,
  type RunRow,
  type RunsFilterState,
} from "$lib/components/runs/runs-filters";
import type { RunStatus } from "$lib/server/runs";
import { listProjects } from "$lib/product-queries";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  project_id: string | null;
  title: string;
}

const VALID_STATUS = new Set<RunStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

const VALID_RANGE = new Set<RunRange>(["24h", "7d", "30d", "all"]);

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ url, locals }) => {
  const agent = (url.searchParams.get("agent") ?? "").trim();
  const statusRaw = (url.searchParams.get("status") ?? "").trim();
  const rangeRaw = (url.searchParams.get("range") ?? "all").trim();
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();

  const range: RunRange = VALID_RANGE.has(rangeRaw as RunRange)
    ? (rangeRaw as RunRange)
    : "all";
  const status =
    statusRaw && VALID_STATUS.has(statusRaw as RunStatus)
      ? (statusRaw as RunStatus)
      : undefined;

  const filter = {
    agent,
    status: statusRaw,
    range,
    project: projectRaw ?? "__any__",
  };

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filter,
    streamed: {
      data: (async () => {
        const em = locals.em ?? await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const [rows, projects, tasks] = await Promise.all([
          listRuns(em, { orgId, userId: null, projectId: locals?.activeProjectId ?? null }),
          listProjects(),
          listTasks(em, { orgId, userId: null, projectId: locals?.activeProjectId ?? null }, {}),
        ]);
        const projectOptions: ProjectOption[] = projects.map((project) => ({ id: project.id, name: project.name }));
        const taskOptions: TaskOption[] = tasks
          .filter((task) => ["pending", "in_progress", "blocked"].includes(task.status ?? ""))
          .map((task) => ({ id: task.id, project_id: task.projectId, title: task.title }));
        const normalised: RunRow[] = rows.map((r) => ({
          id: r.id,
          agent: r.agentName ?? "",
          model: null,
          status: (r.status ?? "queued") as RunStatus,
          project_id: null,
          started_at: isoStamp(r.createdAt),
          ended_at: null,
          sandbox_mode: null,
          iteration_count: null,
        }));
        const filterState: RunsFilterState = {
          range,
          ...(agent ? { agent } : {}),
          ...(status ? { status } : {}),
          ...(projectRaw !== undefined ? { project: projectRaw } : {}),
        };
        return { runs: applyRunsFilters(normalised, filterState), projects: projectOptions, tasks: taskOptions };
      })(),
    },
  };
};

export const actions: Actions = {
  dispatch: async ({ request, locals }) => {
    const form = await request.formData();
    const taskId = String(form.get("taskId") ?? "");
    const projectId = String(form.get("projectId") ?? "") || null;
    const agent = String(form.get("agent") ?? "codex");
    if (!taskId) throw redirect(303, "/runs");

    const em = locals.em ?? await getEm();
    const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
    const result = await dispatchRun(em, { orgId, userId: null, projectId }, { agentName: agent, prompt: taskId });
    const id = result.id;
    throw redirect(303, `/runs/${id}`);
  },
};
