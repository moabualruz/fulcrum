import type { ProductDb, SqlValue } from "../../../../product-kernel/db/types.ts";
import { isFeatureEnabled } from "../../../../product-kernel/features.ts";

// ---------- Types ----------

export interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface BurndownPoint {
  date: string;
  ideal: number;
  actual: number;
}

export interface VelocityBar {
  sprint_id: string;
  sprint_name: string;
  points: number;
}

export interface CycleTimeBin {
  days: number;
  count: number;
}

export interface CycleTimeStats {
  bins: CycleTimeBin[];
  p50: number;
  p90: number;
}

export interface ThroughputPoint {
  week_start: string;
  count: number;
}

export interface WipPoint {
  date: string;
  pending: number;
  in_progress: number;
  blocked: number;
}

export interface CfdPoint {
  date: string;
  pending: number;
  in_progress: number;
  blocked: number;
  completed: number;
  cancelled: number;
}

// ---------- Sprint listing ----------

export async function listSprints(
  db: ProductDb,
  projectId: string,
): Promise<Sprint[]> {
  return db.query<Sprint>(
    `SELECT id, name, start_date::text, end_date::text, status
       FROM sprints WHERE project_id = $1 ORDER BY start_date DESC`,
    [projectId],
  );
}

// ---------- Burndown ----------

export async function loadBurndown(
  db: ProductDb,
  projectId: string,
  sprintId: string,
): Promise<BurndownPoint[]> {
  // Get sprint date range + total points
  const sprints = await db.query<{ start_date: string; end_date: string }>(
    `SELECT start_date::text, end_date::text FROM sprints WHERE id = $1 AND project_id = $2`,
    [sprintId, projectId],
  );
  const sprint = sprints[0];
  if (!sprint) return [];

  const totalRows = await db.query<{ total: string }>(
    `SELECT coalesce(sum(story_points), 0)::text AS total
       FROM tasks WHERE sprint_id = $1`,
    [sprintId],
  );
  const totalPoints = Number(totalRows[0]?.total ?? 0);
  if (totalPoints === 0) return [];

  // Get daily remaining from metrics_cache
  const cached = await db.query<{ snapshot_date: string; payload: string | { remaining: number } }>(
    `SELECT snapshot_date::text, payload FROM metrics_cache
       WHERE project_id = $1 AND sprint_id = $2 AND metric_kind = 'burndown'
       ORDER BY snapshot_date`,
    [projectId, sprintId],
  );

  // Build ideal line
  const startDate = new Date(sprint.start_date);
  const endDate = new Date(sprint.end_date);
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  const pointsPerDay = totalPoints / totalDays;

  // Build lookup of cached actuals
  const actualMap = new Map<string, number>();
  for (const row of cached) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    actualMap.set(row.snapshot_date, payload.remaining ?? 0);
  }

  const points: BurndownPoint[] = [];
  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(startDate.getTime() + d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const ideal = Math.max(0, totalPoints - pointsPerDay * d);
    const actual = actualMap.get(dateStr) ?? (d === 0 ? totalPoints : -1);
    if (actual >= 0) {
      points.push({ date: dateStr, ideal: Math.round(ideal * 100) / 100, actual });
    } else {
      // No cached data for this day — only emit ideal line
      points.push({ date: dateStr, ideal: Math.round(ideal * 100) / 100, actual: -1 });
    }
  }
  return points;
}

// ---------- Velocity ----------

export async function loadVelocity(
  db: ProductDb,
  projectId: string,
  windowSize = 3,
): Promise<VelocityBar[]> {
  return db.query<VelocityBar>(
    `SELECT s.id AS sprint_id, s.name AS sprint_name,
            coalesce(sum(t.story_points), 0)::int AS points
       FROM sprints s
       LEFT JOIN tasks t ON t.sprint_id = s.id AND t.status = 'completed'
       WHERE s.project_id = $1 AND s.status = 'completed'
       GROUP BY s.id, s.name, s.end_date
       ORDER BY s.end_date DESC
       LIMIT $2`,
    [projectId, windowSize],
  );
}

// ---------- Cycle Time ----------

export async function loadCycleTime(
  db: ProductDb,
  projectId: string,
): Promise<CycleTimeStats> {
  // Cycle time = days between first status_changed to in_progress and status_changed to completed
  // We compute from events table
  const rows = await db.query<{ days: string }>(
    `WITH started AS (
       SELECT payload->>'task' AS task_id,
              min(created_at) AS started_at
         FROM events
         WHERE project_id = $1
           AND subject_kind = 'task'
           AND verb = 'status_changed'
           AND payload->>'to' = 'in_progress'
         GROUP BY payload->>'task'
     ),
     finished AS (
       SELECT payload->>'task' AS task_id,
              min(created_at) AS finished_at
         FROM events
         WHERE project_id = $1
           AND subject_kind = 'task'
           AND verb = 'status_changed'
           AND payload->>'to' = 'completed'
         GROUP BY payload->>'task'
     )
     SELECT extract(day FROM f.finished_at - s.started_at)::int::text AS days
       FROM started s
       JOIN finished f ON f.task_id = s.task_id
       WHERE f.finished_at > s.started_at
       ORDER BY days`,
    [projectId],
  );

  const dayValues = rows.map((r) => Number(r.days));
  if (dayValues.length === 0) return { bins: [], p50: 0, p90: 0 };

  // Build histogram bins
  const binMap = new Map<number, number>();
  for (const d of dayValues) {
    binMap.set(d, (binMap.get(d) ?? 0) + 1);
  }
  const bins = Array.from(binMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([days, count]) => ({ days, count }));

  const sorted = [...dayValues].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;

  return { bins, p50, p90 };
}

// ---------- Throughput ----------

export async function loadThroughput(
  db: ProductDb,
  projectId: string,
): Promise<ThroughputPoint[]> {
  return db.query<ThroughputPoint>(
    `SELECT date_trunc('week', e.created_at)::date::text AS week_start,
            count(DISTINCT e.subject_id)::int AS count
       FROM events e
       WHERE e.project_id = $1
         AND e.subject_kind = 'task'
         AND e.verb = 'status_changed'
         AND e.payload->>'to' = 'completed'
       GROUP BY week_start
       ORDER BY week_start`,
    [projectId],
  );
}

// ---------- WIP ----------

export async function loadWip(
  db: ProductDb,
  projectId: string,
): Promise<WipPoint[]> {
  const rows = await db.query<{ snapshot_date: string; payload: string | WipPoint }>(
    `SELECT snapshot_date::text, payload FROM metrics_cache
       WHERE project_id = $1 AND metric_kind = 'wip'
       ORDER BY snapshot_date`,
    [projectId],
  );
  return rows.map((r) => {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return {
      date: r.snapshot_date,
      pending: p.pending ?? 0,
      in_progress: p.in_progress ?? 0,
      blocked: p.blocked ?? 0,
    };
  });
}

// ---------- CFD ----------

export async function loadCfd(
  db: ProductDb,
  projectId: string,
): Promise<CfdPoint[]> {
  const rows = await db.query<{ snapshot_date: string; payload: string | CfdPoint }>(
    `SELECT snapshot_date::text, payload FROM metrics_cache
       WHERE project_id = $1 AND metric_kind = 'cfd'
       ORDER BY snapshot_date`,
    [projectId],
  );
  return rows.map((r) => {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return {
      date: r.snapshot_date,
      pending: p.pending ?? 0,
      in_progress: p.in_progress ?? 0,
      blocked: p.blocked ?? 0,
      completed: p.completed ?? 0,
      cancelled: p.cancelled ?? 0,
    };
  });
}

// ---------- Aggregate loader ----------

export interface ReportsData {
  sprints: Sprint[];
  burndown: BurndownPoint[];
  velocity: VelocityBar[];
  cycleTime: CycleTimeStats;
  throughput: ThroughputPoint[];
  wip: WipPoint[];
  cfd: CfdPoint[];
}

export async function loadReports(
  db: ProductDb,
  projectId: string,
  sprintId?: string,
): Promise<ReportsData> {
  const sprints = await listSprints(db, projectId);
  const activeSprint = sprintId ?? sprints.find((s) => s.status === "active")?.id ?? sprints[0]?.id;

  const [burndown, velocity, cycleTime, throughput, wip, cfd] = await Promise.all([
    activeSprint ? loadBurndown(db, projectId, activeSprint) : Promise.resolve([]),
    loadVelocity(db, projectId),
    loadCycleTime(db, projectId),
    loadThroughput(db, projectId),
    loadWip(db, projectId),
    loadCfd(db, projectId),
  ]);

  return { sprints, burndown, velocity, cycleTime, throughput, wip, cfd };
}

// ---------- LLM Sprint Narration (gated: FULCRUM_FEATURES=report-llm-narration) ----------

export interface NarrationInput {
  projectId: string;
  sprintId: string;
  velocity: number;
  completedTasks: number;
  blockedTasks: number;
  cycleTimeDays: number;
}

export type NarrationResult =
  | { text: string }
  | { skipped: true }
  | { error: "sidecar_unavailable" };

export interface NarrationDeps {
  /** Injected for tests; defaults to real sidecar generate call. */
  generateFn?: (prompt: string) => Promise<{ text: string; tokens_used: number; model: string }>;
}

function buildPrompt(input: NarrationInput): string {
  return (
    `You are a scrum coach. Write a concise one-paragraph sprint retrospective narrative.\n` +
    `Sprint ID: ${input.sprintId}\n` +
    `Velocity: ${input.velocity} points\n` +
    `Completed tasks: ${input.completedTasks}\n` +
    `Blocked tasks: ${input.blockedTasks}\n` +
    `Median cycle time: ${input.cycleTimeDays} days\n` +
    `Summarise the sprint performance and suggest one improvement.`
  );
}

/**
 * Generate an AI narrative for a completed sprint.
 *
 * Returns `{ skipped: true }` when flag is OFF.
 * Returns `{ error: "sidecar_unavailable" }` when sidecar is unreachable — never throws.
 * Returns `{ text }` on success.
 */
export async function generateNarration(
  input: NarrationInput,
  deps: NarrationDeps = {},
): Promise<NarrationResult> {
  // Gate: flag must be ON
  if (!isFeatureEnabled("report-llm-narration")) {
    return { skipped: true };
  }

  // Resolve generate function (real sidecar or test mock)
  let generateFn = deps.generateFn;
  if (!generateFn) {
    const { testGenerate } = await import("./inference-client.ts");
    generateFn = testGenerate;
  }

  try {
    const prompt = buildPrompt(input);
    const result = await generateFn(prompt);
    return { text: result.text };
  } catch {
    return { error: "sidecar_unavailable" };
  }
}
