/**
 * Reports queries — velocity and burndown.
 * Deterministic SQL; no LLM.
 */
import type { ProductDb } from "./db/types.ts";

// ---------- types ----------

export interface VelocityRow {
  sprint_name: string;
  committed_points: number;
  completed_points: number;
}

export interface BurndownRow {
  date: string;
  points_remaining: number;
  ideal: number;
}

// ---------- helpers ----------

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
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

// ---------- burndown ----------

export async function burndown(
  db: ProductDb,
  projectId: string,
  sprintId: string,
): Promise<BurndownRow[]> {
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

  const rows = await db.query<{ date: string; points_remaining: number }>(
    `SELECT date::text, points_remaining
     FROM metrics_cache
     WHERE project_id = $1 AND sprint_id = $2
     ORDER BY date ASC`,
    [projectId, sprintId],
  );

  if (rows.length === 0) {
    // On-demand fallback from current task state
    return burndownOnDemand(db, projectId, sprint, totalDays);
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
  sprint: { capacity_points: number; start_date: string; end_date: string },
  totalDays: number,
): Promise<BurndownRow[]> {
  const result: BurndownRow[] = [];
  const start = new Date(sprint.start_date);

  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

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
