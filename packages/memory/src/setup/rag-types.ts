import type {
  AgentRole,
  RagHealthStatus,
  RagRebuildMode,
  RuntimeDataProfile,
  RuntimeProfileError,
  RuntimeProfilePathKey,
} from 'fulcrum-agent-core'

export const RAG_REBUILD_DOMAINS = ['l0', 'l1', 'fts', 'code', 'vectors', 'graph'] as const
export type RagRebuildDomain = typeof RAG_REBUILD_DOMAINS[number]
export const DEFAULT_RAG_REBUILD_DOMAINS: RagRebuildDomain[] = ['fts', 'code', 'vectors', 'graph']

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
  profile_manifest: RagHealthProfileManifest
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

export interface RagHealthProfileError {
  code: RuntimeProfileError['code']
  profile: RuntimeDataProfile
  path_key: RuntimeProfilePathKey
  path_fingerprint: string
  conflicts_with_profile?: RuntimeDataProfile
  conflicts_with_path_key?: RuntimeProfilePathKey
  conflicts_with_path_fingerprint?: string
}

export interface RagHealthProfileManifest {
  profile: RuntimeDataProfile
  safe_for_destructive_execution: boolean
  disposable: boolean
  requires_confirmation: boolean
  path_fingerprints: Record<RuntimeProfilePathKey, string>
  errors: RagHealthProfileError[]
}

export interface RagHealthDomain {
  status: RagHealthStatus
  [key: string]: unknown
}

export interface RagHealthReport {
  workspace_id: string
  project_id: string
  status: RagHealthStatus
  runtime_profile: RuntimeDataProfile
  profile_manifest: RagHealthProfileManifest
  generated_at: string
  domains: Record<string, RagHealthDomain>
  recommended_actions: string[]
  warnings: string[]
  errors: string[]
}
