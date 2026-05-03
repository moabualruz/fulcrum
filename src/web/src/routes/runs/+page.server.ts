import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import {
  applyRunsFilters,
  type RunRange,
  type RunRow,
  type RunsFilterState,
} from "$lib/components/runs/runs-filters";
import type { RunStatus } from "$lib/server/runs";
import { dispatchRunAction } from "$lib/server/runs";

interface RawRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  project_id: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
}

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
        const db = await openProductDb();
        let rows: RawRow[];
        let projects: ProjectOption[];
        let tasks: TaskOption[];
        try {
          const orgRows = await db.query<{ id: string }>(
            `SELECT id FROM orgs WHERE slug = $1`,
            ["default"],
          );
          const orgId = orgRows[0]?.id;
          if (!orgId) {
            return { runs: [], projects: [], tasks: [] };
          }
          rows = await db.query<RawRow>(
            `SELECT id, agent, model, status, project_id, started_at, ended_at
               FROM agent_runs
              ORDER BY started_at DESC, id ASC`,
          );
          projects = await db.query<ProjectOption>(
            `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name ASC, id ASC`,
            [orgId],
          );
          tasks = await db.query<TaskOption>(
            `SELECT id, project_id, title FROM tasks
              WHERE org_id = $1 AND status IN ('pending', 'in_progress', 'blocked')
              ORDER BY updated_at DESC, id ASC`,
            [orgId],
          );
        } finally {
          await db.close();
        }
        const normalised: RunRow[] = rows.map((r) => ({
          id: r.id,
          agent: r.agent,
          model: r.model,
          status: r.status as RunStatus,
          project_id: r.project_id,
          started_at: isoStamp(r.started_at),
          ended_at: r.ended_at === null ? null : isoStamp(r.ended_at),
        }));
        const filterState: RunsFilterState = {
          range,
          ...(agent ? { agent } : {}),
          ...(status ? { status } : {}),
          ...(projectRaw !== undefined ? { project: projectRaw } : {}),
        };
        return { runs: applyRunsFilters(normalised, filterState), projects, tasks };
      })(),
    },
  };
};

export const actions: Actions = {
  dispatch: async ({ request }) => {
    const form = await request.formData();
    const taskId = String(form.get("taskId") ?? "");
    const projectId = String(form.get("projectId") ?? "") || null;
    const agent = String(form.get("agent") ?? "codex");
    if (!taskId) throw redirect(303, "/runs");

    const db = await openProductDb();
    let id: string;
    try {
      const orgId = await getDefaultOrgId(db);
      const result = await dispatchRunAction(db, { orgId, projectId, taskId, agent });
      id = result.id;
    } finally {
      await db.close();
    }
    throw redirect(303, `/runs/${id}`);
  },
};
