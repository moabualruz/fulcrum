import type { Db } from 'fulcrum-agent-core'

export interface MemoryQueryTraceCommandInput {
  query_trace_id: string
  workspace_id?: string
  project_id?: string
}

export async function getMemoryQueryTraceCommand(input: MemoryQueryTraceCommandInput, db?: Db): Promise<unknown> {
  if (!input.workspace_id) throw new Error('workspace_id required')
  if (!input.project_id) throw new Error('project_id required')
  const { readRagQueryTrace } = await import('fulcrum-memory')
  return readRagQueryTrace({
    query_trace_id: input.query_trace_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
  }, db)
}
