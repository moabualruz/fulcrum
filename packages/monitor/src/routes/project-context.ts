// PR 19 Task 10.2 — GET /project-context?workspace_id=&file= HTTP surface.
//
// Mirrors PR 13 Task 4.2 project_context action over HTTP.
// Same response shape; same workspace-id filtering enforced.
// Empty groups are OMITTED per §11.40.

import type { Db } from 'fulcrum-core'
import { getDb } from 'fulcrum-core'
import { runProjectContext } from 'fulcrum-memory'
import type { ProjectContextInput } from 'fulcrum-memory'

export interface ProjectContextHttpInput {
  workspace_id: string
  project_id?: string
  file?: string
  symbol?: string
  task_id?: string
  run_id?: string
  limit?: number
}

export type ProjectContextHttpResult =
  | { body: Record<string, unknown[]> }
  | { error: string; status: number }

export async function handleProjectContext(
  input: ProjectContextHttpInput,
  db: Db = getDb()
): Promise<ProjectContextHttpResult> {
  if (!input.workspace_id) {
    return { error: 'workspace_id is required', status: 400 }
  }

  const actionInput: ProjectContextInput = {
    workspace_id: input.workspace_id,
    project_id: input.project_id ?? null,
    file: input.file,
    symbol: input.symbol,
    task_id: input.task_id,
    run_id: input.run_id,
    limit: input.limit,
  }

  const body = await runProjectContext(actionInput, db)
  return { body }
}
