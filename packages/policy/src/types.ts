// packages/policy/src/types.ts

export type PolicyScope = 'system' | 'user' | 'workspace' | 'project' | 'team_agent' | 'workflow_step'
export type PolicyAction = 'allow' | 'deny' | 'audit_only'
export type MatcherType =
  | 'tool'
  | 'command'
  | 'path'
  | 'regex'
  | 'domain_network'
  | 'agent_team'
  | 'workflow_step'
  | 'artifact'
  | 'secret_content'

import type { AgentRole } from 'fulcrum-core'
export type { AgentRole }

export interface PolicyMatcher {
  matcher_type: MatcherType
  pattern: string
}

export interface PolicyRule {
  rule_id: string
  scope: PolicyScope
  scope_id: string | null       // null for system scope
  name: string
  description: string | null
  action: PolicyAction
  matchers: PolicyMatcher[]
  enabled: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface EvaluatePolicyInput {
  workspace_id: string
  project_id?: string
  actor_role: AgentRole
  actor_id: string
  action: string               // e.g. 'invoke_team', 'merge_worktree', 'write_file'
  resource_type?: string       // e.g. 'team', 'worktree', 'file'
  resource_id?: string
  context?: Record<string, unknown>
}

export interface PolicyDecision {
  allowed: boolean
  reason?: string
  rule_id?: string
  action: PolicyAction
}

export interface SecretMatch {
  pattern_name: string
  match: string
  index: number
}

export interface SecretScanResult {
  has_secrets: boolean
  matches: SecretMatch[]
}

export interface PolicyEvent {
  evt_id: string
  rule_id: string | null
  workspace_id: string
  action: string
  matched: boolean
  actor_id: string
  resource_type: string | null
  resource_id: string | null
  payload: Record<string, unknown>
  ts: string
}

export interface CreatePolicyRuleInput {
  scope: PolicyScope
  scope_id?: string
  name: string
  description?: string
  action: PolicyAction
  matchers: PolicyMatcher[]
  enabled?: boolean
  priority?: number
}

export interface ListPolicyRulesInput {
  scope?: PolicyScope
  scope_id?: string
  enabled_only?: boolean
}

export interface LogPolicyEventInput {
  rule_id?: string
  workspace_id: string
  action: string
  matched: boolean
  actor_id: string
  resource_type?: string
  resource_id?: string
  payload?: Record<string, unknown>
}

export interface GetAuditLogInput {
  workspace_id: string
  actor_id?: string
  action?: string
  limit?: number
  offset?: number
}
