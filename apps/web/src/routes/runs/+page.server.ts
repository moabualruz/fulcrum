import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { dispatchRun } from "@execution-orchestration/interface/run-actions.ts";
import { loadRunsPageData } from "@execution-orchestration/interface/run-pages.ts";
import {
  type RunRange,
} from "$lib/components/runs/runs-filters";
import type { RunStatus } from "$lib/server/runs";
import { requestServiceScope } from "$lib/server/request-service-scope";

const VALID_STATUS = new Set<RunStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

const VALID_RANGE = new Set<RunRange>(["24h", "7d", "30d", "all"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = ({ url, locals }) => {
  const agent = (url.searchParams.get("agent") ?? "").trim();
  const statusRaw = (url.searchParams.get("status") ?? "").trim();
  const rangeRaw = (url.searchParams.get("range") ?? "all").trim();
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();
  const dateFromRaw = (url.searchParams.get("dateFrom") ?? "").trim();
  const dateToRaw = (url.searchParams.get("dateTo") ?? "").trim();
  const dateFrom = DATE_RE.test(dateFromRaw) ? dateFromRaw : "";
  const dateTo = DATE_RE.test(dateToRaw) ? dateToRaw : "";

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
    dateFrom,
    dateTo,
  };

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    orgId: locals?.orgId ?? null,
    userId: locals?.userId ?? null,
    filter,
    streamed: {
      data: (async () => {
        const projectId = projectRaw !== undefined ? projectRaw || null : locals?.activeProjectId ?? null;
        const { em, ctx } = await requestServiceScope(locals, projectId);
        const data = await loadRunsPageData(em, ctx, {
          range,
          ...(agent ? { agent } : {}),
          ...(status ? { status } : {}),
          ...(projectRaw !== undefined ? { projectId: projectRaw || null } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        });
        return { runs: data.runs.map((run) => ({ ...run, status: run.status as RunStatus })), projects: data.projects, tasks: data.tasks };
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

    const { em, ctx } = await requestServiceScope(locals, projectId);
    const result = await dispatchRun(em, ctx, { agentName: agent, prompt: taskId });
    const id = result.id;
    throw redirect(303, `/runs/${id}`);
  },
};
