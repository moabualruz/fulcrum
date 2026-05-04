import type { RunStatus } from "$lib/server/runs";

export type RunRange = "24h" | "7d" | "30d" | "all";

export interface RunsFilterState {
  agent?: string;
  status?: RunStatus;
  project?: string;
  range: RunRange;
}

export interface RunRow {
  id: string;
  agent: string;
  model: string | null;
  status: RunStatus;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  sandbox_mode: string | null;
  iteration_count: number | null;
}

const RANGE_MS: Record<Exclude<RunRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Pure reducer: narrows `rows` by agent / status / project / range.
 *
 * - agent / status / project filters are exact match; an empty string
 *   matches rows whose corresponding column is null.
 * - range slices by `started_at` relative to `now` (defaults to current
 *   wall clock); "all" disables the time slice.
 */
export function applyRunsFilters(
  rows: readonly RunRow[],
  filter: RunsFilterState,
  now: Date = new Date(),
): RunRow[] {
  const cutoff =
    filter.range === "all"
      ? null
      : now.getTime() - RANGE_MS[filter.range];

  return rows.filter((row) => {
    if (filter.agent !== undefined && row.agent !== filter.agent) return false;
    if (filter.status !== undefined && row.status !== filter.status) return false;
    if (filter.project !== undefined) {
      if (filter.project === "") {
        if (row.project_id !== null) return false;
      } else if (row.project_id !== filter.project) {
        return false;
      }
    }
    if (cutoff !== null) {
      const startedMs = Date.parse(row.started_at);
      if (Number.isFinite(startedMs) && startedMs < cutoff) return false;
    }
    return true;
  });
}
