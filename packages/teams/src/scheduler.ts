// packages/teams/src/scheduler.ts
import type { Db } from '@fulcrum/core'
import type { ScheduleDecision, SchedulerConfig } from './types.js'

const DEFAULTS: Required<SchedulerConfig> = {
  global_cap: 8,
  per_project_cap: 4,
  per_template_cap: 2,
}

// Active statuses: instances that are not yet terminal (TEAM-003: literal constant, not interpolated)
const ACTIVE_STATUSES = "'created','ready','spawning','running','waiting'"

export function canStartTeam(
  db: Db,
  input: {
    workspace_id: string
    project_id?: string
    template_id: string
  },
  config?: SchedulerConfig
): ScheduleDecision {
  const cfg: Required<SchedulerConfig> = { ...DEFAULTS, ...config }

  // 1. Global count: all active instances for this workspace
  const globalRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM team_instances
       WHERE workspace_id = ? AND status IN (${ACTIVE_STATUSES})`
    )
    .get(input.workspace_id) as { cnt: number }
  const globalCount = globalRow.cnt

  // 2. Project count: active instances scoped to this project
  let projectCount = 0
  if (input.project_id !== undefined) {
    const projectRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM team_instances
         WHERE workspace_id = ? AND project_id = ? AND status IN (${ACTIVE_STATUSES})`
      )
      .get(input.workspace_id, input.project_id) as { cnt: number }
    projectCount = projectRow.cnt
  }

  // 3. Template count: active instances for this template in this workspace
  const templateRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM team_instances
       WHERE workspace_id = ? AND template_id = ? AND status IN (${ACTIVE_STATUSES})`
    )
    .get(input.workspace_id, input.template_id) as { cnt: number }
  const templateCount = templateRow.cnt

  const counts = { global: globalCount, project: projectCount, template: templateCount }

  // Check caps in order: global first, then project, then template
  if (globalCount >= cfg.global_cap) {
    return {
      allowed: false,
      reason: `global concurrency cap reached (${globalCount}/${cfg.global_cap})`,
      counts,
    }
  }

  if (input.project_id !== undefined && projectCount >= cfg.per_project_cap) {
    return {
      allowed: false,
      reason: `per-project concurrency cap reached (${projectCount}/${cfg.per_project_cap})`,
      counts,
    }
  }

  if (templateCount >= cfg.per_template_cap) {
    return {
      allowed: false,
      reason: `per-template concurrency cap reached (${templateCount}/${cfg.per_template_cap})`,
      counts,
    }
  }

  return { allowed: true, counts }
}
