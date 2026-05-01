import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import {
  applyRunsFilters,
  type RunRange,
  type RunRow,
  type RunsFilterState,
} from "$lib/components/runs/runs-filters";
import type { RunStatus } from "$lib/server/runs";

interface RawRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  project_id: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
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
        try {
          rows = await db.query<RawRow>(
            `SELECT id, agent, model, status, project_id, started_at, ended_at
               FROM agent_runs
              ORDER BY started_at DESC, id ASC`,
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
        return { runs: applyRunsFilters(normalised, filterState) };
      })(),
    },
  };
};
