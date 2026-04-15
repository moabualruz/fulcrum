import { ulid } from 'ulidx'
import { createHash } from 'crypto'
import { basename, resolve } from 'path'
import type Database from 'better-sqlite3'

const PREFIXES: Record<string, string> = {
  workspace: 'ws_',
  project: 'proj_',
  epic: 'epic_',
  issue: 'iss_',
  task: 'task_',
  prd: 'prd_',
  plan: 'plan_',
  run: 'run_',
  wf: 'wf_',
  worktree: 'wt_',
  review: 'rev_',
  artifact: 'art_',
  memory: 'mem_',
  handoff: 'hof_',
  contract: 'ac_',
  event: 'evt_',
  team: 'team_',
  team_instance: 'ti_',
  policy: 'pol_',
  subtask: 'subtask_',
  cycle: 'cycle_',
  milestone: 'mile_',
  comment: 'cmt_',
  status_event: 'sev_',
  lock: 'lock_',
  span: 'span_',
  policy_event: 'pevt_',
  agent_profile: 'ap_',
  agent_definition: 'adef_',
  run_event: 'revt_',
  hook_event: 'hev_',
}

const DISPLAY_PREFIXES: Record<string, string> = {
  epic: 'EPIC',
  issue: 'ISS',
  task: 'TASK',
  prd: 'PRD',
  plan: 'PLAN',
  run: 'RUN',
  wf: 'WF',
  artifact: 'ART',
  review: 'REV',
  team: 'TEAM',
  subtask: 'SUBTASK',
  cycle: 'CYC',
  milestone: 'MILE',
  comment: 'CMT',
}

/**
 * Compute deterministic workspace_id and project_id from an absolute directory path.
 * Uses sha256[:12] of the resolved path, prefixed with a sanitized directory name.
 * Stable across runs, unique across projects. No file I/O required.
 *
 * Example: /home/user/myproject → { workspace_id: 'ws_myproject_a1b2c3d4e5f6', project_id: 'proj_myproject_a1b2c3d4e5f6' }
 */
export function projectIdsFromPath(absPath?: string): { workspace_id: string; project_id: string } {
  const resolved = resolve(absPath ?? process.cwd())
  const hash = createHash('sha256').update(resolved).digest('hex').slice(0, 12)
  const sanitizedName = basename(resolved).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'project'
  return {
    workspace_id: `ws_${sanitizedName}_${hash}`,
    project_id: `proj_${sanitizedName}_${hash}`,
  }
}

export function newId(entityType: string): string {
  return (PREFIXES[entityType] ?? '') + ulid()
}

export function nextDisplayId(entityType: string, projectId: string, db: Database.Database): string {
  const prefix = DISPLAY_PREFIXES[entityType]
  if (!prefix) throw new Error(`No display prefix for entity type: ${entityType}`)
  const result = db.prepare(`
    INSERT INTO display_id_sequences (entity_type, project_id, last_value)
    VALUES (?, ?, 1)
    ON CONFLICT(entity_type, project_id) DO UPDATE SET last_value = last_value + 1
    RETURNING last_value
  `).get(entityType, projectId) as { last_value: number }
  return `${prefix}-${result.last_value}`
}
