import type { ArtifactRow } from "$lib/server/artifacts";

export interface ArtifactsFilterState {
  projectId?: string;
  runId?: string;
  taskId?: string;
  mime?: string;
  kind?: string;
  showArchived?: boolean;
}

export function applyArtifactsFilters(
  rows: ArtifactRow[],
  filter: ArtifactsFilterState,
): ArtifactRow[] {
  let result = rows;
  if (filter.projectId) {
    result = result.filter((r) => r.project_id === filter.projectId);
  }
  if (filter.runId) {
    result = result.filter((r) => r.run_id === filter.runId);
  }
  if (filter.taskId) {
    result = result.filter((r) => r.task_id === filter.taskId);
  }
  if (filter.mime) {
    result = result.filter((r) => r.mime === filter.mime);
  }
  if (filter.kind) {
    result = result.filter((r) => r.kind === filter.kind);
  }
  return result;
}

/** Extract unique MIME types from rows for facet display. */
export function extractMimeTypes(rows: ArtifactRow[]): string[] {
  return Array.from(new Set(rows.filter((r) => r.mime).map((r) => r.mime!)))
    .sort();
}

/** Extract unique kinds from rows for facet display. */
export function extractKinds(rows: ArtifactRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.kind))).sort();
}
