import type { EntityManager } from "typeorm";
import type { AppContext } from "@execution-orchestration/application/runs/types.ts";
import type {
  AgentRunDetailRow,
  ApprovalQueueItem,
  ProjectRunRow,
  RunEventRow,
  RunRowsFilter,
  RunsPageData,
} from "@execution-orchestration/application/runs/queries.ts";

export type {
  AgentRunDetailRow,
  ApprovalQueueItem,
  ProjectRunRow,
  RunEventRow,
  RunRow,
  RunRowsFilter,
  RunsPageData,
} from "@execution-orchestration/application/runs/queries.ts";

export interface ProjectRunPageData {
  run: AgentRunDetailRow;
  transcript: string | null;
  diff: string | null;
  artifacts: Array<{
    id: string;
    org_id: string;
    project_id: string | null;
    run_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    body_path: string | null;
    sha256: string | null;
    size: number | null;
    mime: string | null;
    archived: boolean;
    lifecycle_state: string;
    retention_until: string | null;
    preview_kind: string;
    doc_id: string | null;
    linked_doc_id: string | null;
    promoted_to_memory: boolean;
    created_at: string;
    downloadHref: string;
  }>;
  events: Array<RunEventRow & { created_at: string }>;
  approvalQueue: ApprovalQueueItem[];
}

export async function loadRunsPageData(
  em: EntityManager,
  ctx: AppContext,
  filter: RunRowsFilter = {},
): Promise<RunsPageData> {
  const queries = await import("@execution-orchestration/application/runs/queries.ts");
  return queries.loadRunsPageData(em, ctx, filter);
}

export async function listProjectRuns(
  em: EntityManager,
  ctx: AppContext,
): Promise<ProjectRunRow[]> {
  const queries = await import("@execution-orchestration/application/runs/queries.ts");
  return queries.listProjectRuns(em, ctx);
}

export async function getProjectRunPageData(
  em: EntityManager,
  ctx: AppContext,
  runId: string,
): Promise<ProjectRunPageData> {
  const queries = await import("@execution-orchestration/application/runs/queries.ts");
  return queries.getProjectRunPageData(em, ctx, runId);
}
