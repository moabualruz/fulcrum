import type { AgentRole, RagHealthStatus, RagRebuildMode, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'

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
  runtime_profile?: RuntimeDataProfile
  data_dir?: string
  confirm_profile?: RuntimeDataProfile
  verification_refs?: string[]
  domains?: RagRebuildDomain[]
  actor?: RagRebuildActor
  allow_empty?: boolean
  embed?: boolean
  repair_plan_id?: string
  on_before_promote?: () => void | Promise<void>
}

export interface RagRebuildReport {
  report_id: string
  status: 'completed' | 'failed' | 'cancelled'
  mode: RagRebuildMode
  scope: {
    workspace_id: string
    project_id: string
    runtime_profile?: RuntimeDataProfile
    domains: RagRebuildDomain[]
  }
  profile_manifest: RuntimeDataProfileManifest
  profile_confirmation?: RuntimeDataProfile | null
  backup?: null | { backup_ref: string; restorable: boolean; backup_path?: string }
  verification_refs: string[]
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
  repair_plan_id?: string | null
  final_health_status?: RagHealthStatus | null
  verification?: Record<string, unknown>
  retryable_actions?: string[]
}
