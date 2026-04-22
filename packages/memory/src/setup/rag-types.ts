import type { AgentRole, RagRebuildMode } from 'fulcrum-agent-core'

export const RAG_REBUILD_DOMAINS = ['l0', 'l1', 'fts', 'code', 'vectors', 'graph'] as const
export type RagRebuildDomain = typeof RAG_REBUILD_DOMAINS[number]

export interface RagRebuildActor {
  kind: 'human' | 'agent'
  role: AgentRole
  id: string
}

export interface RagParityCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  expected?: number
  actual?: number
  details?: unknown
}

export interface RagRebuildRequest {
  workspace_id: string
  project_id: string
  mode: RagRebuildMode
  domains?: RagRebuildDomain[]
  actor?: RagRebuildActor
  allow_empty?: boolean
  embed?: boolean
  on_before_promote?: () => void | Promise<void>
}

export interface RagRebuildReport {
  report_id: string
  status: 'completed' | 'failed' | 'cancelled'
  mode: RagRebuildMode
  scope: {
    workspace_id: string
    project_id: string
    domains: RagRebuildDomain[]
  }
  candidate: null | {
    candidate_id: string
    status: string
    disposition: string
    input_snapshot_id: string | null
    input_snapshot_status: string | null
    served_state_unchanged: boolean
  }
  counts: Record<string, number>
  parity: RagParityCheck[]
  warnings: string[]
  errors: unknown[]
  artifact_path: string | null
}

