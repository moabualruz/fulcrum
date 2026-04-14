// packages/teams/src/types.ts

import type { AgentRole } from '@fulcrum/core'
export type { AgentRole }

/**
 * L1 roles are the only roles allowed to invoke other teams.
 * Per spec §17.4: only chief_of_staff can spawn sub-teams.
 */
export const L1_ROLES: ReadonlySet<AgentRole> = new Set(['chief_of_staff'])

export interface TeamSlot {
  slot_id: string
  role: AgentRole
  min_count: number
  max_count: number
  concurrency_cap: number
  required: boolean
  description?: string
  agent_profile?: string
  spawn_mode?: 'auto' | 'manual'
  allowed_tools?: string[]
  write_level?: 'read_only' | 'comment' | 'write' | 'admin'
  team_permissions?: string[]
  fallbacks?: string[]
}

export type CommunicationMode = 'broadcast' | 'direct' | 'hub_and_spoke'
export type WorktreePolicy = 'per_slot' | 'shared' | 'none'
export type BudgetClass = 'small' | 'medium' | 'large'
export type LatencyClass = 'fast' | 'normal' | 'slow'
export type QualityClass = 'draft' | 'standard' | 'high'

export interface TeamPolicy {
  communication_mode?: CommunicationMode
  memory_policy?: string
  worktree_policy?: WorktreePolicy
  review_policy?: string
  budget_class?: BudgetClass
  latency_class?: LatencyClass
  quality_class?: QualityClass
}

export interface TeamTemplate {
  template_id: string
  name: string
  description?: string
  slots: TeamSlot[]
  policy?: TeamPolicy
  created_at: string
  updated_at: string
}

export interface TeamInstance {
  instance_id: string
  template_id: string
  workspace_id: string
  project_id?: string
  display_id: string
  status: 'created' | 'ready' | 'spawning' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'cancelled'
  status_category: 'backlog' | 'active' | 'blocked' | 'done'
  purpose: string
  task_id?: string
  created_by_agent_id: string
  resolved_slots: Record<string, string[]>
  version: number
  created_at: string
  updated_at: string
}

export interface TeamMember {
  instance_id: string
  slot_id: string
  agent_id: string
  role: AgentRole
  joined_at: string
}

export interface TeamStatus {
  instance_id: string
  display_id: string
  status: string
  status_category: string
  slot_occupancy: Record<string, { current: number; max: number; agents: string[] }>
  active_member_count: number
  concurrency_cap_violations: string[]
}

export interface CreateTeamTemplateInput {
  name: string
  description?: string
  slots: TeamSlot[]
  policy?: TeamPolicy
}

export interface InvokeTeamInput {
  template_id: string
  workspace_id: string
  project_id?: string
  purpose: string
  task_id?: string
  caller_agent_id: string
  caller_role: AgentRole
  initial_slots?: Record<string, string[]>
}

export interface HeartbeatTeamInput {
  instance_id: string
  status: 'ready' | 'spawning' | 'running' | 'waiting' | 'blocked'
  resolved_slots?: Record<string, string[]>
}

export interface CompleteTeamInput {
  instance_id: string
  final_status: 'completed' | 'failed' | 'cancelled'
}

export interface ListTeamInstancesInput {
  workspace_id: string
  project_id?: string
  status_category?: 'backlog' | 'active' | 'blocked' | 'done'
  limit?: number
  offset?: number
}

export interface GetTeamStatusInput {
  instance_id: string
  workspace_id: string
}
