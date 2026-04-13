// packages/monitor/src/metrics.ts
import { ulid } from 'ulidx'
import { getDb } from '@fulcrum/core'
import type {
  DailyMetrics,
  ProjectMetrics,
  AgentMetrics,
  BurndownData,
  BurndownPoint,
  Metrics,
  GetMetricsInput,
  GetBurndownInput,
  GetAgentMetricsInput,
  RunReplay,
  ReplayRunInput,
} from './types.js'

export async function recordDailyMetrics(input: DailyMetrics): Promise<void> {
  const db = getDb()
  const id = `adm_${ulid()}`

  db.prepare(`
    INSERT OR REPLACE INTO analytics_daily
      (id, workspace_id, project_id, date,
       issues_created, issues_closed,
       tasks_created, tasks_completed, tasks_blocked,
       runs_started, runs_finished, runs_failed,
       memory_writes, memory_recalls)
    VALUES (
      COALESCE(
        (SELECT id FROM analytics_daily WHERE workspace_id = ? AND project_id = ? AND date = ?),
        ?
      ),
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    input.workspace_id,
    input.project_id,
    input.date,
    id,
    input.workspace_id,
    input.project_id,
    input.date,
    input.issues_created,
    input.issues_closed,
    input.tasks_created,
    input.tasks_completed,
    input.tasks_blocked,
    input.runs_started,
    input.runs_finished,
    input.runs_failed,
    input.memory_writes,
    input.memory_recalls,
  )
}

export async function getMetrics(input: GetMetricsInput): Promise<Metrics> {
  const db = getDb()

  let dailyQuery = `SELECT * FROM analytics_daily WHERE workspace_id = ?`
  const dailyParams: unknown[] = [input.workspace_id]

  if (input.project_id) {
    dailyQuery += ` AND project_id = ?`
    dailyParams.push(input.project_id)
  }
  if (input.start_date) {
    dailyQuery += ` AND date >= ?`
    dailyParams.push(input.start_date)
  }
  if (input.end_date) {
    dailyQuery += ` AND date <= ?`
    dailyParams.push(input.end_date)
  }
  dailyQuery += ` ORDER BY date ASC`

  const dailyRows = db.prepare(dailyQuery).all(...dailyParams) as Array<Record<string, unknown>>

  let projectQuery = `SELECT * FROM analytics_project WHERE workspace_id = ?`
  const projectParams: unknown[] = [input.workspace_id]

  if (input.project_id) {
    projectQuery += ` AND project_id = ?`
    projectParams.push(input.project_id)
  }
  if (input.start_date) {
    projectQuery += ` AND date >= ?`
    projectParams.push(input.start_date)
  }
  if (input.end_date) {
    projectQuery += ` AND date <= ?`
    projectParams.push(input.end_date)
  }
  projectQuery += ` ORDER BY date ASC`

  const projectRows = db.prepare(projectQuery).all(...projectParams) as Array<Record<string, unknown>>

  const daily: DailyMetrics[] = dailyRows.map((r) => ({
    workspace_id: r.workspace_id as string,
    project_id: r.project_id as string,
    date: r.date as string,
    issues_created: r.issues_created as number,
    issues_closed: r.issues_closed as number,
    tasks_created: r.tasks_created as number,
    tasks_completed: r.tasks_completed as number,
    tasks_blocked: r.tasks_blocked as number,
    runs_started: r.runs_started as number,
    runs_finished: r.runs_finished as number,
    runs_failed: r.runs_failed as number,
    memory_writes: r.memory_writes as number,
    memory_recalls: r.memory_recalls as number,
  }))

  const project: ProjectMetrics[] = projectRows.map((r) => ({
    workspace_id: r.workspace_id as string,
    project_id: r.project_id as string,
    date: r.date as string,
    wip_count: r.wip_count as number,
    throughput: r.throughput as number,
    lead_time_h: r.lead_time_h as number | null,
    blocked_h: r.blocked_h as number | null,
  }))

  return { daily, project }
}

export async function getBurndown(input: GetBurndownInput): Promise<BurndownData> {
  const db = getDb()

  // One query: completions per day within the range
  const completions = db.prepare(`
    SELECT date(updated_at) AS d, COUNT(*) AS cnt
    FROM tasks
    WHERE workspace_id = ? AND project_id = ?
      AND (status = 'completed' OR status = 'finished')
      AND date(updated_at) BETWEEN ? AND ?
    GROUP BY d
    ORDER BY d ASC
  `).all(input.workspace_id, input.project_id ?? null, input.start_date, input.end_date) as { d: string; cnt: number }[]

  // One query: task creation per day (for computing running total per day)
  const creations = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS cnt
    FROM tasks
    WHERE workspace_id = ? AND project_id = ?
      AND date(created_at) <= ?
    GROUP BY d
    ORDER BY d ASC
  `).all(input.workspace_id, input.project_id ?? null, input.end_date) as { d: string; cnt: number }[]

  // Build cumulative maps
  const completionMap = new Map<string, number>()
  for (const row of completions) {
    completionMap.set(row.d, row.cnt)
  }

  const creationMap = new Map<string, number>()
  for (const row of creations) {
    creationMap.set(row.d, row.cnt)
  }

  // Iterate over the date range and accumulate running totals
  const points: BurndownPoint[] = []
  const startMs = new Date(input.start_date).getTime()
  const endMs = new Date(input.end_date).getTime()
  const dayMs = 86_400_000

  let runningTotal = 0
  let runningCompleted = 0

  for (let ms = startMs; ms <= endMs; ms += dayMs) {
    const date = new Date(ms).toISOString().slice(0, 10)
    runningTotal += creationMap.get(date) ?? 0
    runningCompleted += completionMap.get(date) ?? 0
    points.push({ date, total: runningTotal, completed: runningCompleted, remaining: runningTotal - runningCompleted })
  }

  return {
    project_id: input.project_id,
    start_date: input.start_date,
    end_date: input.end_date,
    points,
  }
}

export async function getAgentMetrics(input: GetAgentMetricsInput): Promise<AgentMetrics[]> {
  const db = getDb()

  let query = `SELECT * FROM analytics_agent WHERE workspace_id = ?`
  const params: unknown[] = [input.workspace_id]

  if (input.agent_id) {
    query += ` AND agent_id = ?`
    params.push(input.agent_id)
  }
  if (input.start_date) {
    query += ` AND date >= ?`
    params.push(input.start_date)
  }
  if (input.end_date) {
    query += ` AND date <= ?`
    params.push(input.end_date)
  }
  query += ` ORDER BY date ASC`

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>

  return rows.map((r) => ({
    workspace_id: r.workspace_id as string,
    agent_id: r.agent_id as string,
    date: r.date as string,
    runs_started: r.runs_started as number,
    runs_completed: r.runs_completed as number,
    runs_blocked: r.runs_blocked as number,
    runs_failed: r.runs_failed as number,
    avg_duration_min: r.avg_duration_min as number | null,
    handoff_count: r.handoff_count as number,
  }))
}

export async function replayRun(input: ReplayRunInput): Promise<RunReplay> {
  const db = getDb()

  // Events table stores payload as JSON text; run_id is embedded in payload
  const rows = db.prepare(`
    SELECT event_id, event_type, payload, ts
    FROM events
    WHERE json_extract(payload, '$.run_id') = ?
    ORDER BY ts ASC
  `).all(input.run_id) as Array<{
    event_id: string
    event_type: string
    payload: string
    ts: string
  }>

  return {
    run_id: input.run_id,
    events: rows.map((r) => ({
      event_id: r.event_id,
      event_type: r.event_type,
      payload: JSON.parse(r.payload) as unknown,
      ts: r.ts,
    })),
  }
}
