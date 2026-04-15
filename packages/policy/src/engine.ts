// packages/policy/src/engine.ts
import { getDb, FulcrumError, isL1, canMerge, newId, listAgentDefinitions } from '@fulcrum/core'
import { minimatch } from 'minimatch'
import type { AgentRole } from '@fulcrum/core'
import type {
  PolicyRule, PolicyMatcher, EvaluatePolicyInput, PolicyDecision,
  CreatePolicyRuleInput, ListPolicyRulesInput, PolicyScope, PolicyAction, MatcherType,
} from './types.js'

// Hardcoded SYSTEM_INVARIANTS — priority 1000, cannot be overridden by DB rules.
// Each entry has a `check` function: returns true if this invariant should DENY.
interface SystemInvariant {
  name: string
  priority: 1000
  action: 'deny'
  rule_id: string    // synthetic ID used in PolicyDecision
  check: (input: EvaluatePolicyInput) => boolean
}

export const SYSTEM_INVARIANTS: SystemInvariant[] = [
  {
    name: 'only_l1_invokes_teams',
    priority: 1000,
    action: 'deny',
    rule_id: 'SYSTEM:only_l1_invokes_teams',
    check: (input) => input.action === 'invoke_team' && !isL1(input.actor_role as AgentRole),
  },
  {
    name: 'only_integration_worker_merges',
    priority: 1000,
    action: 'deny',
    rule_id: 'SYSTEM:only_integration_worker_merges',
    check: (input) => input.action === 'merge_worktree' && !canMerge(input.actor_role as AgentRole),
  },
  {
    name: 'no_task_bypass',
    priority: 1000,
    action: 'deny',
    rule_id: 'SYSTEM:no_task_bypass',
    check: (input) => input.action === 'start_run_without_task',
  },
  {
    // GAP-AGENTDEF-6: capability-based enforcement.
    // If an agent_definitions row exists for this role and it does NOT include
    // the required capability, deny the action.
    name: 'capability_required_for_action',
    priority: 1000,
    action: 'deny',
    rule_id: 'SYSTEM:capability_required_for_action',
    check: (input) => {
      // Map action → required capability
      const ACTION_CAPABILITY: Record<string, string> = {
        invoke_team:     'create_teams',
        dispatch_agents: 'dispatch_agents',
        merge_worktree:  'merge_worktrees',
      }
      const required = ACTION_CAPABILITY[input.action]
      if (!required) return false  // no capability gating for this action

      // Look up the agent definition for this workspace + role
      try {
        const db = getDb()
        const defs = listAgentDefinitions(input.actor_role, input.workspace_id, db)
        if (defs.length === 0) return false  // no definition → defer to other checks
        const caps: string[] = defs[0].capabilities ?? []
        return !caps.includes(required)
      } catch {
        return false  // graceful degradation if DB not ready
      }
    },
  },
  {
    name: 'chief_of_staff_no_direct_writes',
    priority: 1000,
    action: 'deny',
    rule_id: 'SYSTEM:chief_of_staff_no_direct_writes',
    check: (input) => {
      // Applies to all L1 roles (spec §4.1). chief_of_staff is currently
      // the only L1 role, but future L1 roles inherit the prohibition.
      if (!isL1(input.actor_role as AgentRole)) return false
      const action = input.action ?? ''
      // Deny any mutating Claude Code tool invocation
      const DENIED_TOOL_ACTIONS = [
        'tool_use:Write',
        'tool_use:Edit',
        'tool_use:MultiEdit',
        'tool_use:NotebookEdit',
      ]
      if (DENIED_TOOL_ACTIONS.includes(action)) return true
      // Deny any shell git subcommand (covers commit, push, merge, rebase, etc.)
      if (action === 'shell_exec:git') return true
      if (action.startsWith('shell_exec:git ')) return true
      return false
    },
  },
]

function rowToRule(row: Record<string, unknown>): PolicyRule {
  return {
    rule_id: row.rule_id as string,
    scope: row.scope as PolicyScope,
    scope_id: row.scope_id as string | null,
    name: row.name as string,
    description: row.description as string | null,
    action: row.action as PolicyAction,
    matchers: (() => {
      try { return JSON.parse(row.matchers as string) as PolicyMatcher[] }
      catch { return [] }
    })(),
    enabled: (row.enabled as number) === 1,
    priority: row.priority as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function matcherMatches(matcher: PolicyMatcher, input: EvaluatePolicyInput): boolean {
  const { matcher_type, pattern } = matcher
  switch (matcher_type) {
    case 'tool':
    case 'command':
    case 'artifact':
      // Glob pattern match on action (mirrors Python fnmatch behavior)
      return minimatch(input.action, pattern, { nocase: true })
    case 'path': {
      // minimatch glob against resource_id. Note: single '*' does NOT cross
      // directory separators — use '**' to match nested paths (e.g. 'src/**').
      const target = input.resource_id ?? ''
      return minimatch(target, pattern, { nocase: true })
    }
    case 'agent_team':
    case 'workflow_step':
      // Exact match on action
      return input.action === pattern
    case 'regex':
      try {
        return new RegExp(pattern).test(input.action)
      } catch {
        return false
      }
    case 'domain_network':
      // Match against resource_id or action
      return (input.resource_id ?? '') === pattern || input.action === pattern
    case 'secret_content':
      // secret_content rules cannot be auto-evaluated by the engine.
      // Callers must invoke checkSecrets() separately and handle denial
      // before calling evaluatePolicy(). This matcher type exists only
      // for documentation/audit purposes in the policy rule record.
      return false
    default:
      return false
  }
}

function ruleMatches(rule: PolicyRule, input: EvaluatePolicyInput): boolean {
  if (!rule.enabled) return false
  if (rule.matchers.length === 0) return false
  // A rule matches if ANY of its matchers matches
  return rule.matchers.some(m => matcherMatches(m, input))
}

export async function evaluatePolicy(input: EvaluatePolicyInput, db = getDb()): Promise<PolicyDecision> {
  // Step 1: Check SYSTEM_INVARIANTS first (cannot be overridden)
  for (const invariant of SYSTEM_INVARIANTS) {
    if (invariant.check(input)) {
      return {
        allowed: false,
        reason: invariant.name,
        rule_id: invariant.rule_id,
        action: 'deny',
      }
    }
  }

  // Step 2: Load workspace/project rules, ordered by priority DESC
  const params: unknown[] = [input.workspace_id]
  let scopeFilter = `(scope = 'workspace' AND scope_id = ?)`
  if (input.project_id) {
    params.push(input.project_id)
    scopeFilter += ` OR (scope = 'project' AND scope_id = ?)`
  }
  const rows = db.prepare(`
    SELECT * FROM policy_rules
    WHERE (${scopeFilter}) AND enabled = 1
    ORDER BY priority DESC
  `).all(...params) as Record<string, unknown>[]

  const rules = rows.map(rowToRule)

  // Step 3: First matching rule wins
  for (const rule of rules) {
    if (ruleMatches(rule, input)) {
      return {
        allowed: rule.action !== 'deny',
        reason: rule.name,
        rule_id: rule.rule_id,
        action: rule.action,
      }
    }
  }

  // Step 4: Default allow
  return { allowed: true, action: 'allow' }
}

export async function createPolicyRule(input: CreatePolicyRuleInput, db = getDb()): Promise<PolicyRule> {
  if (!input.name.trim()) throw new FulcrumError('name must not be empty', 'invalid_input')
  const rule_id = newId('policy')
  const now = new Date().toISOString()
  const priority = input.priority ?? 100
  const enabled = input.enabled !== false ? 1 : 0

  db.prepare(`
    INSERT INTO policy_rules
      (rule_id, scope, scope_id, name, description, action, matchers, enabled, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule_id,
    input.scope,
    input.scope_id ?? null,
    input.name,
    input.description ?? null,
    input.action,
    JSON.stringify(input.matchers),
    enabled,
    priority,
    now, now
  )

  const row = db.prepare('SELECT * FROM policy_rules WHERE rule_id = ?').get(rule_id) as Record<string, unknown>
  return rowToRule(row)
}

export async function listPolicyRules(input: ListPolicyRulesInput, db = getDb()): Promise<PolicyRule[]> {
  let sql = 'SELECT * FROM policy_rules WHERE 1=1'
  const params: unknown[] = []
  if (input.scope) { sql += ' AND scope = ?'; params.push(input.scope) }
  if (input.scope_id !== undefined) { sql += ' AND scope_id = ?'; params.push(input.scope_id) }
  if (input.enabled_only) { sql += ' AND enabled = 1' }
  sql += ' ORDER BY priority DESC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToRule)
}
