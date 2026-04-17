// PR 20 Task 11.5 — get_analytics read-only action.
//
// Returns rollup rows per Part 02 §"Analytics rollups" lines 302-310.
// Cold install returns []. Rollups produced only when analytics-enabled rule is toggled.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'

export type AnalyticsDimension = 'daily' | 'cycle' | 'project' | 'agent' | 'team'

export interface GetAnalyticsInput {
  dimension: AnalyticsDimension
  workspace_id: string
  project_id?: string
  from?: string
  to?: string
  limit?: number
}

export interface AnalyticsRow {
  dimension: string
  bucket: string
  metric: string
  value: number
  workspace_id: string
  project_id?: string
}

const TABLE_MAP: Record<AnalyticsDimension, string> = {
  daily: 'analytics_daily',
  cycle: 'analytics_cycles',
  project: 'analytics_projects',
  agent: 'analytics_agents',
  team: 'analytics_teams',
}

export async function getAnalytics(
  input: GetAnalyticsInput,
  db: Db = getDb()
): Promise<AnalyticsRow[]> {
  const table = TABLE_MAP[input.dimension]
  const limit = input.limit ?? 100

  try {
    // Check table exists — analytics tables are created by the operator-toggle migration
    const tableExists = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table)
    if (!tableExists) return []

    const clauses: string[] = ['workspace_id = ?']
    const params: unknown[] = [input.workspace_id]

    if (input.project_id) {
      clauses.push('project_id = ?')
      params.push(input.project_id)
    }
    if (input.from) {
      clauses.push('bucket >= ?')
      params.push(input.from)
    }
    if (input.to) {
      clauses.push('bucket <= ?')
      params.push(input.to)
    }
    params.push(limit)

    return db.prepare(
      `SELECT * FROM ${table} WHERE ${clauses.join(' AND ')} LIMIT ?`
    ).all(...params) as AnalyticsRow[]
  } catch {
    return []
  }
}
