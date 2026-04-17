// packages/monitor/src/metrics.ts
import { ulid } from 'ulidx'
import { getDb } from 'fulcrum-agent-core'
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

// ─── Extended metric input types ──────────────────────────────────────────────

export interface GetIssueBurndownInput {
  workspace_id: string
  start_date: string
  end_date: string
}

export interface GetTaskCycleTimeInput {
  workspace_id: string
  start_date?: string
  end_date?: string
}

export interface GetWipCountInput {
  workspace_id: string
}

export interface GetThroughputDailyInput {
  workspace_id: string
  start_date: string
  end_date: string
}

export interface GetReviewRejectionRateInput {
  workspace_id: string
}

export interface GetFailedRunRateInput {
  workspace_id: string
}

export interface GetAgentRunSummaryInput {
  workspace_id: string
}

export interface GetMemoryScopeDistributionInput {
  workspace_id: string
}

export interface GetMemoryRecallCountInput {
  workspace_id: string
}

export interface GetPerRoleMetricsInput {
  workspace_id: string
}

export interface GetMemoryMetricsInput {
  workspace_id: string
}

export interface RollupDailyInput {
  workspace_id: string
  project_id?: string
  date?: string // ISO date 'YYYY-MM-DD', defaults to today
}

export async function rollupDaily(input: RollupDailyInput): Promise<void> {
  const db = getDb()
  const d = input.date ?? new Date().toISOString().slice(0, 10)
  const dNext = new Date(d + 'T00:00:00.000Z')
  dNext.setUTCDate(dNext.getUTCDate() + 1)
  const dNextStr = dNext.toISOString().slice(0, 10)

  const dStart = d + 'T00:00:00.000Z'
  const dEnd = dNextStr + 'T00:00:00.000Z'
  const ws = input.workspace_id

  const count = (sql: string, params: unknown[]): number => {
    const row = db.prepare(sql).get(...params) as { cnt: number }
    return row?.cnt ?? 0
  }

  const issues_created = count(
    `SELECT COUNT(*) AS cnt FROM issues WHERE workspace_id = ? AND created_at >= ? AND created_at < ?`,
    [ws, dStart, dEnd],
  )

  const issues_closed = count(
    `SELECT COUNT(*) AS cnt FROM issues WHERE workspace_id = ? AND status = 'done' AND updated_at >= ? AND updated_at < ?`,
    [ws, dStart, dEnd],
  )

  const tasks_created = count(
    `SELECT COUNT(*) AS cnt FROM tasks WHERE workspace_id = ? AND created_at >= ? AND created_at < ?`,
    [ws, dStart, dEnd],
  )

  const tasks_completed = count(
    `SELECT COUNT(*) AS cnt FROM tasks WHERE workspace_id = ? AND status = 'completed' AND updated_at >= ? AND updated_at < ?`,
    [ws, dStart, dEnd],
  )

  const tasks_blocked = count(
    `SELECT COUNT(*) AS cnt FROM tasks WHERE workspace_id = ? AND status = 'blocked' AND updated_at >= ? AND updated_at < ?`,
    [ws, dStart, dEnd],
  )

  const runs_started = count(
    `SELECT COUNT(*) AS cnt FROM agent_runs WHERE workspace_id = ? AND started_at >= ? AND started_at < ?`,
    [ws, dStart, dEnd],
  )

  const runs_finished = count(
    `SELECT COUNT(*) AS cnt FROM agent_runs WHERE workspace_id = ? AND status = 'completed' AND updated_at >= ? AND updated_at < ?`,
    [ws, dStart, dEnd],
  )

  const runs_failed = count(
    `SELECT COUNT(*) AS cnt FROM agent_runs WHERE workspace_id = ? AND status = 'failed' AND updated_at >= ? AND updated_at < ?`,
    [ws, dStart, dEnd],
  )

  const memory_writes = count(
    `SELECT COUNT(*) AS cnt FROM memories WHERE workspace_id = ? AND created_at >= ? AND created_at < ?`,
    [ws, dStart, dEnd],
  )

  // memory_recalls: query events table for 'memory_recalled' event type
  // Fall back to 0 if the events table doesn't have this column or no rows match
  let memory_recalls = 0
  try {
    memory_recalls = count(
      `SELECT COUNT(*) AS cnt FROM events WHERE workspace_id = ? AND event_type = 'memory_recalled' AND ts >= ? AND ts < ?`,
      [ws, dStart, dEnd],
    )
  } catch {
    memory_recalls = 0
  }

  await recordDailyMetrics({
    workspace_id: ws,
    project_id: input.project_id ?? null,
    date: d,
    issues_created,
    issues_closed,
    tasks_created,
    tasks_completed,
    tasks_blocked,
    runs_started,
    runs_finished,
    runs_failed,
    memory_writes,
    memory_recalls,
  })
}

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
        (SELECT id FROM analytics_daily WHERE workspace_id = ? AND (project_id = ? OR (? IS NULL AND project_id IS NULL)) AND date = ?),
        ?
      ),
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    input.workspace_id,
    input.project_id,
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

// ─── Extended metric functions ────────────────────────────────────────────────

/** Issue burndown: created vs resolved per day */
export function getIssueBurndown(
  db: ReturnType<typeof getDb>,
  input: GetIssueBurndownInput,
): Array<{ date: string; created: number; resolved: number; open: number }> {
  const created = db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS cnt
    FROM issues
    WHERE workspace_id = ?
      AND date(created_at) BETWEEN ? AND ?
    GROUP BY d
    ORDER BY d ASC
  `).all(input.workspace_id, input.start_date, input.end_date) as { d: string; cnt: number }[]

  const resolved = db.prepare(`
    SELECT date(updated_at) AS d, COUNT(*) AS cnt
    FROM issues
    WHERE workspace_id = ?
      AND status IN ('done','cancelled')
      AND date(updated_at) BETWEEN ? AND ?
    GROUP BY d
    ORDER BY d ASC
  `).all(input.workspace_id, input.start_date, input.end_date) as { d: string; cnt: number }[]

  const createdMap = new Map<string, number>()
  for (const row of created) createdMap.set(row.d, row.cnt)

  const resolvedMap = new Map<string, number>()
  for (const row of resolved) resolvedMap.set(row.d, row.cnt)

  // Build date range
  const points: Array<{ date: string; created: number; resolved: number; open: number }> = []
  const startMs = new Date(input.start_date).getTime()
  const endMs = new Date(input.end_date).getTime()
  const dayMs = 86_400_000

  let runningOpen = 0
  for (let ms = startMs; ms <= endMs; ms += dayMs) {
    const date = new Date(ms).toISOString().slice(0, 10)
    const c = createdMap.get(date) ?? 0
    const r = resolvedMap.get(date) ?? 0
    runningOpen += c - r
    points.push({ date, created: c, resolved: r, open: Math.max(0, runningOpen) })
  }

  return points
}

/** Task cycle time: avg time from queued to done per role (via agent_runs) */
export function getTaskCycleTime(
  db: ReturnType<typeof getDb>,
  input: GetTaskCycleTimeInput,
): Array<{ role: string; avg_days: number; count: number }> {
  let query = `
    SELECT
      ar.role,
      AVG(CAST((julianday(t.updated_at) - julianday(t.created_at)) AS REAL)) AS avg_days,
      COUNT(DISTINCT t.task_id) AS count
    FROM tasks t
    JOIN agent_runs ar ON ar.task_id = t.task_id AND ar.workspace_id = t.workspace_id
    WHERE t.workspace_id = ?
      AND t.status IN ('completed','done')
  `
  const params: unknown[] = [input.workspace_id]

  if (input.start_date) {
    query += ` AND date(t.created_at) >= ?`
    params.push(input.start_date)
  }
  if (input.end_date) {
    query += ` AND date(t.created_at) <= ?`
    params.push(input.end_date)
  }

  query += ` GROUP BY ar.role ORDER BY ar.role ASC`

  const rows = db.prepare(query).all(...params) as Array<{
    role: string
    avg_days: number | null
    count: number
  }>

  return rows.map((r) => ({
    role: r.role,
    avg_days: r.avg_days ?? 0,
    count: r.count,
  }))
}

/** WIP count: tasks in active/running status per role (via agent_runs) */
export function getWipCount(
  db: ReturnType<typeof getDb>,
  input: GetWipCountInput,
): Array<{ role: string; count: number }> {
  const rows = db.prepare(`
    SELECT ar.role, COUNT(DISTINCT ar.run_id) AS count
    FROM agent_runs ar
    WHERE ar.workspace_id = ?
      AND ar.status IN ('running','in_progress')
    GROUP BY ar.role
    ORDER BY ar.role ASC
  `).all(input.workspace_id) as Array<{ role: string; count: number }>

  return rows
}

/** Daily throughput: tasks completed per day */
export function getThroughputDaily(
  db: ReturnType<typeof getDb>,
  input: GetThroughputDailyInput,
): Array<{ date: string; completed: number }> {
  const rows = db.prepare(`
    SELECT date(updated_at) AS date, COUNT(*) AS completed
    FROM tasks
    WHERE workspace_id = ?
      AND status IN ('completed','done')
      AND date(updated_at) BETWEEN ? AND ?
    GROUP BY date
    ORDER BY date ASC
  `).all(input.workspace_id, input.start_date, input.end_date) as Array<{
    date: string
    completed: number
  }>

  return rows
}

/** Review rejection rate: rejected / total by reviewer */
export function getReviewRejectionRate(
  db: ReturnType<typeof getDb>,
  input: GetReviewRejectionRateInput,
): Array<{ reviewer_id: string; total: number; rejected: number; rate: number }> {
  const rows = db.prepare(`
    SELECT
      reviewer_agent_id AS reviewer_id,
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('rejected','changes_requested') THEN 1 ELSE 0 END) AS rejected
    FROM reviews
    WHERE workspace_id = ?
      AND reviewer_agent_id IS NOT NULL
    GROUP BY reviewer_agent_id
    ORDER BY reviewer_agent_id ASC
  `).all(input.workspace_id) as Array<{
    reviewer_id: string
    total: number
    rejected: number
  }>

  return rows.map((r) => ({
    reviewer_id: r.reviewer_id,
    total: r.total,
    rejected: r.rejected,
    rate: r.total > 0 ? r.rejected / r.total : 0,
  }))
}

/** Failed run rate: runs that failed / total, grouped by role */
export function getFailedRunRate(
  db: ReturnType<typeof getDb>,
  input: GetFailedRunRateInput,
): Array<{ role: string; total: number; failed: number; rate: number }> {
  const rows = db.prepare(`
    SELECT
      role,
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('blocked','stale','escalated') THEN 1 ELSE 0 END) AS failed
    FROM agent_runs
    WHERE workspace_id = ?
    GROUP BY role
    ORDER BY role ASC
  `).all(input.workspace_id) as Array<{
    role: string
    total: number
    failed: number
  }>

  return rows.map((r) => ({
    role: r.role,
    total: r.total,
    failed: r.failed,
    rate: r.total > 0 ? r.failed / r.total : 0,
  }))
}

/** Agent run summary: per-agent counts, avg duration */
export function getAgentRunSummary(
  db: ReturnType<typeof getDb>,
  input: GetAgentRunSummaryInput,
): Array<{
  agent_id: string
  total_runs: number
  completed: number
  failed: number
  avg_duration_ms: number | null
}> {
  const rows = db.prepare(`
    SELECT
      agent_id,
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status IN ('blocked','stale','escalated') THEN 1 ELSE 0 END) AS failed,
      AVG(
        CASE
          WHEN finished_at IS NOT NULL AND started_at IS NOT NULL
          THEN (julianday(finished_at) - julianday(started_at)) * 86400000.0
          ELSE NULL
        END
      ) AS avg_duration_ms
    FROM agent_runs
    WHERE workspace_id = ?
      AND agent_id != ''
    GROUP BY agent_id
    ORDER BY agent_id ASC
  `).all(input.workspace_id) as Array<{
    agent_id: string
    total_runs: number
    completed: number
    failed: number
    avg_duration_ms: number | null
  }>

  return rows
}

/** Memory scope distribution */
export function getMemoryScopeDistribution(
  db: ReturnType<typeof getDb>,
  input: GetMemoryScopeDistributionInput,
): Array<{ scope: string; count: number }> {
  const rows = db.prepare(`
    SELECT scope, COUNT(*) AS count
    FROM memories
    WHERE workspace_id = ?
    GROUP BY scope
    ORDER BY scope ASC
  `).all(input.workspace_id) as Array<{ scope: string; count: number }>

  return rows
}

/** Memory recall count: proxy via access_count > 0 */
export function getMemoryRecallCount(
  db: ReturnType<typeof getDb>,
  input: GetMemoryRecallCountInput,
): Array<{ kind: string; count: number }> {
  const rows = db.prepare(`
    SELECT kind, COUNT(*) AS count
    FROM memories
    WHERE workspace_id = ?
      AND access_count > 0
    GROUP BY kind
    ORDER BY kind ASC
  `).all(input.workspace_id) as Array<{ kind: string; count: number }>

  return rows
}

/** Per-role metrics: WIP, completed last 30d, avg cycle days */
export function getPerRoleMetrics(
  db: ReturnType<typeof getDb>,
  input: GetPerRoleMetricsInput,
): Array<{ role: string; wip: number; completed_30d: number; avg_cycle_days: number | null }> {
  const wipRows = db.prepare(`
    SELECT role, COUNT(*) AS wip
    FROM agent_runs
    WHERE workspace_id = ?
      AND status IN ('running','in_progress')
    GROUP BY role
  `).all(input.workspace_id) as Array<{ role: string; wip: number }>

  const completedRows = db.prepare(`
    SELECT ar.role, COUNT(DISTINCT t.task_id) AS completed_30d
    FROM tasks t
    JOIN agent_runs ar ON ar.task_id = t.task_id AND ar.workspace_id = t.workspace_id
    WHERE t.workspace_id = ?
      AND t.status IN ('completed','done')
      AND date(t.updated_at) >= date('now', '-30 days')
    GROUP BY ar.role
  `).all(input.workspace_id) as Array<{ role: string; completed_30d: number }>

  const cycleRows = db.prepare(`
    SELECT ar.role,
      AVG(CAST((julianday(t.updated_at) - julianday(t.created_at)) AS REAL)) AS avg_cycle_days
    FROM tasks t
    JOIN agent_runs ar ON ar.task_id = t.task_id AND ar.workspace_id = t.workspace_id
    WHERE t.workspace_id = ?
      AND t.status IN ('completed','done')
    GROUP BY ar.role
  `).all(input.workspace_id) as Array<{ role: string; avg_cycle_days: number | null }>

  // Merge all roles
  const roles = new Set<string>([
    ...wipRows.map((r) => r.role),
    ...completedRows.map((r) => r.role),
    ...cycleRows.map((r) => r.role),
  ])

  const wipMap = new Map(wipRows.map((r) => [r.role, r.wip]))
  const completedMap = new Map(completedRows.map((r) => [r.role, r.completed_30d]))
  const cycleMap = new Map(cycleRows.map((r) => [r.role, r.avg_cycle_days]))

  return Array.from(roles)
    .sort()
    .map((role) => ({
      role,
      wip: wipMap.get(role) ?? 0,
      completed_30d: completedMap.get(role) ?? 0,
      avg_cycle_days: cycleMap.get(role) ?? null,
    }))
}

/** Memory effectiveness: total, by_kind, by_scope */
export function getMemoryMetrics(
  db: ReturnType<typeof getDb>,
  input: GetMemoryMetricsInput,
): { total: number; by_kind: Array<{ kind: string; count: number }>; by_scope: Array<{ scope: string; count: number }> } {
  const totalRow = db.prepare(
    `SELECT COUNT(*) AS total FROM memories WHERE workspace_id = ?`
  ).get(input.workspace_id) as { total: number }

  const by_kind = db.prepare(`
    SELECT kind, COUNT(*) AS count
    FROM memories
    WHERE workspace_id = ?
    GROUP BY kind
    ORDER BY kind ASC
  `).all(input.workspace_id) as Array<{ kind: string; count: number }>

  const by_scope = db.prepare(`
    SELECT scope, COUNT(*) AS count
    FROM memories
    WHERE workspace_id = ?
    GROUP BY scope
    ORDER BY scope ASC
  `).all(input.workspace_id) as Array<{ scope: string; count: number }>

  return {
    total: totalRow?.total ?? 0,
    by_kind,
    by_scope,
  }
}

// ─── Forecasting ─────────────────────────────────────────────────────────────

export interface GetForecastingInput {
  workspace_id: string
  horizon_days?: number
}

export function getForecasting(
  db: ReturnType<typeof getDb>,
  input: GetForecastingInput,
): {
  avg_cycle_days: number | null
  avg_daily_throughput: number | null
  estimated_completion_days: number | null
  open_task_count: number
} {
  const horizon = input.horizon_days ?? 30

  // avg cycle time (days) for tasks completed in the past horizon days
  const cycleRow = db.prepare(`
    SELECT AVG(CAST((julianday(updated_at) - julianday(created_at)) AS REAL)) AS avg_cycle_days
    FROM tasks
    WHERE workspace_id = ?
      AND status = 'completed'
      AND date(updated_at) >= date('now', ? || ' days')
  `).get(input.workspace_id, `-${horizon}`) as { avg_cycle_days: number | null }

  // completed tasks in the past horizon days
  const completedRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM tasks
    WHERE workspace_id = ?
      AND status = 'completed'
      AND date(updated_at) >= date('now', ? || ' days')
  `).get(input.workspace_id, `-${horizon}`) as { cnt: number }

  // open task count
  const openRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM tasks
    WHERE workspace_id = ?
      AND status NOT IN ('completed', 'cancelled')
  `).get(input.workspace_id) as { cnt: number }

  const avg_cycle_days = cycleRow.avg_cycle_days ?? null
  const avg_daily_throughput = horizon > 0 ? completedRow.cnt / horizon : null
  const open_task_count = openRow.cnt

  const estimated_completion_days =
    avg_daily_throughput && avg_daily_throughput > 0
      ? open_task_count / avg_daily_throughput
      : null

  return {
    avg_cycle_days,
    avg_daily_throughput,
    estimated_completion_days,
    open_task_count,
  }
}

// ─── Original replayRun ───────────────────────────────────────────────────────

export async function replayRun(input: ReplayRunInput): Promise<RunReplay> {
  const db = getDb()

  // Events table stores payload as JSON text; run_id is embedded in payload.
  // Column names in the schema are evt_id and evt_type (aliased for RunReplay contract).
  const rows = (input.workspace_id
    ? db.prepare(`
        SELECT evt_id AS event_id, evt_type AS event_type, payload, ts
        FROM events
        WHERE workspace_id = ? AND json_extract(payload, '$.run_id') = ?
        ORDER BY ts ASC
      `).all(input.workspace_id, input.run_id)
    : db.prepare(`
        SELECT evt_id AS event_id, evt_type AS event_type, payload, ts
        FROM events
        WHERE json_extract(payload, '$.run_id') = ?
        ORDER BY ts ASC
      `).all(input.run_id)
  ) as Array<{
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
