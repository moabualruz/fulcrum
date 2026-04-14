import { ulid } from 'ulid'
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
  policy: 'pol_',
  subtask: 'subtask_',
  cycle: 'cycle_',
  milestone: 'mile_',
  comment: 'cmt_',
  status_event: 'sev_',
  lock: 'lock_',
  span: 'span_',
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
