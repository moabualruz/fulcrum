/**
 * Reports — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { isFeatureEnabled } from "../legacy/web-runtime.ts";

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
  em: EntityManager,
  projectId: string,
): Promise<Sprint[]> {
  const db = em.getKysely<any>();
  const rows = await db
    .selectFrom("sprints")
    .select(["id", "name", "start_date", "end_date", "status"])
    .where("project_id", "=", projectId)
    .orderBy("start_date", "desc")
    .execute();
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row["id"]),
    name: String(row["name"]),
    start_date: dateText(row["start_date"]),
    end_date: dateText(row["end_date"]),
    status: String(row["status"]),
  }));
}

// ---------- Burndown ----------

export async function loadBurndown(
  em: EntityManager,
  projectId: string,
  sprintId: string,
): Promise<BurndownPoint[]> {
  const db = em.getKysely<any>();
  const sprints = await db
    .selectFrom("sprints")
    .select(["start_date", "end_date"])
    .where("id", "=", sprintId)
    .where("project_id", "=", projectId)
    .execute();
  const sprint = sprints[0];
  if (!sprint) return [];

  const taskRows = await db
    .selectFrom("tasks")
    .select(["points"])
    .where("sprint_id", "=", sprintId)
    .execute();
  const totalPoints = taskRows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row["points"] ?? 0), 0);
  if (totalPoints === 0) return [];

  const cached = await db
    .selectFrom("metrics_cache")
    .select(["date", "points_remaining"])
    .where("project_id", "=", projectId)
    .where("sprint_id", "=", sprintId)
    .orderBy("date", "asc")
    .execute() as Array<{ date: string; points_remaining: number }>;

  const startDate = new Date(dateText(sprint.start_date));
  const endDate = new Date(dateText(sprint.end_date));
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  const pointsPerDay = totalPoints / totalDays;

  const actualMap = new Map<string, number>();
  for (const row of cached) {
    actualMap.set(dateText(row.date), Number(row.points_remaining ?? 0));
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
      points.push({ date: dateStr, ideal: Math.round(ideal * 100) / 100, actual: -1 });
    }
  }
  return points;
}

// ---------- Velocity ----------

export async function loadVelocity(
  em: EntityManager,
  projectId: string,
  windowSize = 3,
): Promise<VelocityBar[]> {
  const db = em.getKysely<any>();
  const sprints = await db
    .selectFrom("sprints")
    .select(["id", "name", "end_date"])
    .where("project_id", "=", projectId)
    .where("status", "=", "completed")
    .orderBy("end_date", "desc")
    .limit(windowSize)
    .execute();
  if (sprints.length === 0) return [];
  const tasks = await db
    .selectFrom("tasks")
    .select(["sprint_id", "points"])
    .where("status", "=", "completed")
    .where("sprint_id", "in", sprints.map((row: Record<string, unknown>) => String(row["id"])))
    .execute();
  const pointsBySprint = new Map<string, number>();
  for (const task of tasks as Array<Record<string, unknown>>) {
    const sprint = String(task["sprint_id"]);
    pointsBySprint.set(sprint, (pointsBySprint.get(sprint) ?? 0) + Number(task["points"] ?? 0));
  }
  return sprints.map((row: Record<string, unknown>) => ({
    sprint_id: String(row["id"]),
    sprint_name: String(row["name"]),
    points: pointsBySprint.get(String(row["id"])) ?? 0,
  }));
}

// ---------- Cycle Time ----------

export async function loadCycleTime(
  em: EntityManager,
  projectId: string,
): Promise<CycleTimeStats> {
  const db = em.getKysely<any>();
  const rows = await db
    .selectFrom("events")
    .select(["payload", "created_at"])
    .where("project_id", "=", projectId)
    .where("subject_kind", "=", "task")
    .where("verb", "=", "status_changed")
    .execute() as Array<{ payload: string | Record<string, unknown>; created_at: Date | string }>;

  const started = new Map<string, Date>();
  const finished = new Map<string, Date>();
  for (const row of rows) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const taskId = String(payload["task"] ?? "");
    if (!taskId) continue;
    const at = new Date(row.created_at);
    if (payload["to"] === "in_progress" && (!started.has(taskId) || at < started.get(taskId)!)) started.set(taskId, at);
    if (payload["to"] === "completed" && (!finished.has(taskId) || at < finished.get(taskId)!)) finished.set(taskId, at);
  }

  const dayValues = [...started.entries()]
    .map(([taskId, startedAt]) => {
      const finishedAt = finished.get(taskId);
      if (!finishedAt || finishedAt <= startedAt) return null;
      return Math.floor((finishedAt.getTime() - startedAt.getTime()) / 86400000);
    })
    .filter((days): days is number => days !== null)
    .sort((a, b) => a - b);
  if (dayValues.length === 0) return { bins: [], p50: 0, p90: 0 };

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
  em: EntityManager,
  projectId: string,
): Promise<ThroughputPoint[]> {
  const db = em.getKysely<any>();
  const rows = await db
    .selectFrom("events")
    .select(["subject_id", "payload", "created_at"])
    .where("project_id", "=", projectId)
    .where("subject_kind", "=", "task")
    .where("verb", "=", "status_changed")
    .execute() as Array<{ subject_id: string; payload: string | Record<string, unknown>; created_at: Date | string }>;
  const weeks = new Map<string, Set<string>>();
  for (const row of rows) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (payload["to"] !== "completed") continue;
    const week = weekStart(row.created_at);
    const set = weeks.get(week) ?? new Set<string>();
    set.add(row.subject_id);
    weeks.set(week, set);
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week_start, ids]) => ({ week_start, count: ids.size }));
}

// ---------- WIP ----------

export async function loadWip(
  em: EntityManager,
  projectId: string,
): Promise<WipPoint[]> {
  const rows = await metricPayloadRows<WipPoint>(em, projectId, "wip");
  return rows.map((r) => {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return {
      date: r.date,
      pending: p.pending ?? 0,
      in_progress: p.in_progress ?? 0,
      blocked: p.blocked ?? 0,
    };
  });
}

// ---------- CFD ----------

export async function loadCfd(
  em: EntityManager,
  projectId: string,
): Promise<CfdPoint[]> {
  const rows = await metricPayloadRows<CfdPoint>(em, projectId, "cfd");
  return rows.map((r) => {
    const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return {
      date: r.date,
      pending: p.pending ?? 0,
      in_progress: p.in_progress ?? 0,
      blocked: p.blocked ?? 0,
      completed: p.completed ?? 0,
      cancelled: p.cancelled ?? 0,
    };
  });
}

async function metricPayloadRows<T>(
  em: EntityManager,
  projectId: string,
  _kind: string,
): Promise<Array<{ date: string; payload: string | T }>> {
  const rows = await em.getKysely<any>()
    .selectFrom("metrics_cache")
    .select(["date", "status_counts"])
    .where("project_id", "=", projectId)
    .orderBy("date", "asc")
    .execute();
  return rows.map((row: Record<string, unknown>) => ({
    date: dateText(row["date"]),
    payload: row["status_counts"] as string | T,
  }));
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function weekStart(value: Date | string): string {
  const date = new Date(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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
  em: EntityManager,
  projectId: string,
  sprintId?: string,
): Promise<ReportsData> {
  const sprints = await listSprints(em, projectId);
  const activeSprint = sprintId ?? sprints.find((s) => s.status === "active")?.id ?? sprints[0]?.id;

  const [burndown, velocity, cycleTime, throughput, wip, cfd] = await Promise.all([
    activeSprint ? loadBurndown(em, projectId, activeSprint) : Promise.resolve([]),
    loadVelocity(em, projectId),
    loadCycleTime(em, projectId),
    loadThroughput(em, projectId),
    loadWip(em, projectId),
    loadCfd(em, projectId),
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

export async function generateNarration(
  input: NarrationInput,
  deps: NarrationDeps = {},
): Promise<NarrationResult> {
  if (!isFeatureEnabled("report-llm-narration")) {
    return { skipped: true };
  }

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
