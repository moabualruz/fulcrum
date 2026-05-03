/**
 * Reports queries — velocity, cycle time, throughput, WIP, CFD, burndown.
 * All deterministic SQL; no LLM.
 */
import type { ProductDb } from "./db/types.ts";

// ---------- types ----------

export interface VelocityRow {
  sprint_name: string;
  committed_points: number;
  completed_points: number;
}

export interface CycleTimeRow {
  task_id: string;
  title: string;
  cycle_time_hours: number;
  started_at: string;
  completed_at: string;
}

export interface CycleTimeResult {
  items: CycleTimeRow[];
  p50: number;
  p75: number;
  p95: number;
}

export interface ThroughputRow {
  week: string; // ISO week e.g. "2026-W18"
  tasks_completed: number;
}

export interface WipResult {
  current_wip: number;
  sparkline: { date: string; wip_count: number }[];
}

export interface CfdRow {
  date: string;
  status_category: string;
  count: number;
}

export interface BurndownRow {
  date: string;
  points_remaining: number;
  ideal: number;
}

// ---------- helpers ----------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** Count business-calendar days between two dates (inclusive). */
function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  // ISO week algorithm
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ---------- velocity ----------

export async function velocity(
  db: ProductDb,
  projectId: string,
  sprintCount = 3,
): Promise<VelocityRow[]> {
  return db.query<VelocityRow>(
    `SELECT s.name AS sprint_name,
            s.capacity_points AS committed_points,
            COALESCE(SUM(mc.points_completed), 0)::int AS completed_points
     FROM sprints s
     LEFT JOIN metrics_cache mc ON mc.sprint_id = s.id AND mc.project_id = s.project_id
     WHERE s.project_id = $1 AND s.status = 'completed'
     GROUP BY s.id, s.name, s.capacity_points, s.end_date
     ORDER BY s.end_date DESC
     LIMIT $2`,
    [projectId, sprintCount],
  );
}

// ---------- cycle time ----------

export async function cycleTime(
  db: ProductDb,
  projectId: string,
  days = 30,
): Promise<CycleTimeResult> {
  // Find tasks with in_progress→done transitions via events
  const rows = await db.query<CycleTimeRow>(
    `WITH started AS (
       SELECT subject_id AS task_id, MIN(created_at) AS started_at
       FROM events
       WHERE project_id = $1
         AND subject_kind = 'task'
         AND verb = 'status_changed'
         AND payload->>'to' = 'in_progress'
       GROUP BY subject_id
     ),
     finished AS (
       SELECT subject_id AS task_id, MIN(created_at) AS completed_at
       FROM events
       WHERE project_id = $1
         AND subject_kind = 'task'
         AND verb = 'status_changed'
         AND payload->>'to' = 'completed'
       GROUP BY subject_id
     )
     SELECT s.task_id,
            t.title,
            EXTRACT(EPOCH FROM (f.completed_at - s.started_at)) / 3600.0 AS cycle_time_hours,
            s.started_at::text AS started_at,
            f.completed_at::text AS completed_at
     FROM started s
     JOIN finished f ON f.task_id = s.task_id
     JOIN tasks t ON t.id = s.task_id
     WHERE f.completed_at >= now() - ($2 || ' days')::interval
     ORDER BY cycle_time_hours ASC`,
    [projectId, days],
  );

  const hours = rows.map((r) => Number(r.cycle_time_hours)).sort((a, b) => a - b);

  return {
    items: rows,
    p50: percentile(hours, 50),
    p75: percentile(hours, 75),
    p95: percentile(hours, 95),
  };
}

// ---------- throughput ----------

export async function throughput(
  db: ProductDb,
  projectId: string,
  weeks = 12,
): Promise<ThroughputRow[]> {
  // Aggregate from metrics_cache by ISO week
  const rows = await db.query<{ date: string; tasks_completed: number }>(
    `SELECT date::text, tasks_completed
     FROM metrics_cache
     WHERE project_id = $1
     ORDER BY date ASC`,
    [projectId],
  );

  // Group by ISO week
  const weekMap = new Map<string, number>();
  for (const r of rows) {
    const w = isoWeek(r.date);
    weekMap.set(w, (weekMap.get(w) ?? 0) + Number(r.tasks_completed));
  }

  const allWeeks = [...weekMap.entries()]
    .map(([week, tasks_completed]) => ({ week, tasks_completed }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return allWeeks.slice(-weeks);
}

// ---------- WIP ----------

export async function wip(
  db: ProductDb,
  projectId: string,
): Promise<WipResult> {
  // Last 7 days from metrics_cache
  const sparkline = await db.query<{ date: string; wip_count: number }>(
    `SELECT date::text AS date, wip_count
     FROM metrics_cache
     WHERE project_id = $1
       AND date >= CURRENT_DATE - INTERVAL '7 days'
     ORDER BY date ASC`,
    [projectId],
  );

  const current_wip = sparkline.length > 0
    ? Number(sparkline[sparkline.length - 1]!.wip_count)
    : 0;

  return { current_wip, sparkline };
}

// ---------- cumulative flow ----------

const STATUS_CATEGORIES = ["pending", "in_progress", "completed", "cancelled"] as const;

export async function cumulativeFlow(
  db: ProductDb,
  projectId: string,
  sprintId?: string,
): Promise<CfdRow[]> {
  // Reconstruct daily status counts from events
  // Approach: get all task status changes, compute status at end of each day
  const filter = sprintId
    ? `AND mc.sprint_id = $2`
    : "";
  const params: (string | number)[] = [projectId];
  if (sprintId) params.push(sprintId);

  // Use metrics_cache dates as scaffold; compute from events
  const dates = await db.query<{ date: string }>(
    `SELECT DISTINCT date::text AS date FROM metrics_cache
     WHERE project_id = $1 ${filter}
     ORDER BY date ASC`,
    params,
  );

  if (dates.length === 0) return [];

  // For each date, count tasks by status at end of that day
  const result: CfdRow[] = [];
  for (const { date } of dates) {
    // Get the latest status of each task as of end of this date
    const statusCounts = await db.query<{ status: string; cnt: number }>(
      `WITH latest_status AS (
         SELECT DISTINCT ON (subject_id)
                subject_id,
                CASE
                  WHEN verb = 'status_changed' THEN payload->>'to'
                  WHEN verb = 'created' THEN COALESCE(payload->>'status', 'pending')
                  ELSE NULL
                END AS status
         FROM events
         WHERE project_id = $1
           AND subject_kind = 'task'
           AND verb IN ('created', 'status_changed')
           AND created_at::date <= $2::date
         ORDER BY subject_id, created_at DESC, id DESC
       )
       SELECT status, COUNT(*)::int AS cnt
       FROM latest_status
       WHERE status IS NOT NULL
       GROUP BY status`,
      [projectId, date],
    );

    const countMap = new Map(statusCounts.map((r) => [r.status, Number(r.cnt)]));
    for (const cat of STATUS_CATEGORIES) {
      result.push({
        date,
        status_category: cat,
        count: countMap.get(cat) ?? 0,
      });
    }
  }

  return result;
}

// ---------- burndown ----------

export async function burndown(
  db: ProductDb,
  projectId: string,
  sprintId: string,
): Promise<BurndownRow[]> {
  // Get sprint info
  const sprints = await db.query<{
    capacity_points: number;
    start_date: string;
    end_date: string;
  }>(
    `SELECT capacity_points, start_date::text, end_date::text FROM sprints WHERE id = $1 AND project_id = $2`,
    [sprintId, projectId],
  );
  if (sprints.length === 0) return [];
  const sprint = sprints[0]!;
  const totalDays = daysBetween(sprint.start_date, sprint.end_date);

  // Get metrics cache rows
  const rows = await db.query<{ date: string; points_remaining: number }>(
    `SELECT date::text, points_remaining
     FROM metrics_cache
     WHERE project_id = $1 AND sprint_id = $2
     ORDER BY date ASC`,
    [projectId, sprintId],
  );

  if (rows.length === 0) {
    // Fallback: compute on-demand from current task state
    return burndownOnDemand(db, projectId, sprintId, sprint, totalDays);
  }

  return rows.map((r) => {
    const dayNum = daysBetween(sprint.start_date, r.date);
    const daysLeft = Math.max(totalDays - dayNum, 0);
    const ideal = totalDays > 0
      ? sprint.capacity_points * (daysLeft / totalDays)
      : 0;
    return {
      date: r.date,
      points_remaining: Number(r.points_remaining),
      ideal: Math.round(ideal * 100) / 100,
    };
  });
}

async function burndownOnDemand(
  db: ProductDb,
  projectId: string,
  sprintId: string,
  sprint: { capacity_points: number; start_date: string; end_date: string },
  totalDays: number,
): Promise<BurndownRow[]> {
  // Compute from events for each day of the sprint
  const result: BurndownRow[] = [];
  const start = new Date(sprint.start_date);

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    // Count completed points by this date
    const completed = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM tasks t
       WHERE t.project_id = $1
         AND t.status = 'completed'
         AND EXISTS (
           SELECT 1 FROM events e
           WHERE e.subject_id = t.id
             AND e.verb = 'status_changed'
             AND e.payload->>'to' = 'completed'
             AND e.created_at::date <= $2::date
         )`,
      [projectId, dateStr],
    );

    const pointsRemaining = sprint.capacity_points - Number(completed[0]?.total ?? 0);
    const daysLeft = Math.max(totalDays - d, 0);
    const ideal = totalDays > 0
      ? sprint.capacity_points * (daysLeft / totalDays)
      : 0;

    result.push({
      date: dateStr,
      points_remaining: Math.max(pointsRemaining, 0),
      ideal: Math.round(ideal * 100) / 100,
    });
  }

  return result;
}
