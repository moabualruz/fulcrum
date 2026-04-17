// v2b PR 12 Task 3.5 — list_activations action.
// Read-only snapshot of workspace activation state.

import { getDb, type Db } from 'fulcrum-agent-core'

export interface ListActivationsInput {
  workspace_id: string
  project_id?: string | null
}

export interface ActivationsResponse {
  active_workflows: unknown[]
  active_teams: unknown[]
  active_runs: unknown[]
  policy_overrides: unknown[]
}

export function listActivations(
  input: ListActivationsInput,
  db: Db = getDb()
): ActivationsResponse {
  const ws = input.workspace_id

  const active_workflows = db.prepare(`
    SELECT wf_id, workspace_id, project_id, status, status_category
    FROM workflow_runs
    WHERE workspace_id = ? AND status_category = 'active'
    LIMIT 50
  `).all(ws)

  const active_teams = db.prepare(`
    SELECT instance_id, workspace_id, template_id, status_category, created_at
    FROM team_instances
    WHERE workspace_id = ? AND status_category = 'active'
    LIMIT 50
  `).all(ws)

  const active_runs = db.prepare(`
    SELECT run_id, workspace_id, role, status, status_category
    FROM agent_runs
    WHERE workspace_id = ? AND status_category = 'active'
    LIMIT 50
  `).all(ws)

  const policy_overrides = db.prepare(`
    SELECT rule_id, action, name, scope, scope_id, enabled
    FROM policy_rules
    WHERE (scope = 'workspace' AND scope_id = ?) OR scope = 'global'
    LIMIT 50
  `).all(ws)

  return { active_workflows, active_teams, active_runs, policy_overrides }
}
