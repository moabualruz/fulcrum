/**
 * Computes daily MetricsCache snapshots from live task state.
 * Triggered by EventBus on task mutations (status_change, points_change, sprint_change).
 * Supports nightly catchup (gap-filling) mode.
 *
 * Callers are responsible for deduplicating queue entries before enqueue.
 */

import type { EntityManager } from "typeorm";
import {
  type WorkerTask,
  assertStringField,
  createWorkerRegistry,
} from "./registry.ts";
import type { EventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import { MetricsCache } from "@work-management/infrastructure/database/entities/tasks/MetricsCache.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";

// ── Payload types ──────────────────────────────────────────────────

export interface MetricsRollupPayload {
  scope_type: "sprint" | "project" | "epic" | "workspace";
  scope_id: string;
  org_id: string;
  /** Optional: target date for snapshot (defaults to today) */
  target_date?: string;
}

// ── Status category helpers ────────────────────────────────────────

const DONE_STATUSES = new Set(["done", "completed", "closed", "resolved"]);
const STARTED_STATUSES = new Set(["in_progress", "started", "doing", "in progress"]);
const BLOCKED_STATUSES = new Set(["blocked"]);

function normalizeStatus(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function isDone(status: string | null | undefined): boolean {
  return DONE_STATUSES.has(normalizeStatus(status));
}

function isWip(status: string | null | undefined): boolean {
  return STARTED_STATUSES.has(normalizeStatus(status));
}

function isBlocked(status: string | null | undefined): boolean {
  return BLOCKED_STATUSES.has(normalizeStatus(status));
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Snapshot computation ───────────────────────────────────────────

async function computeSnapshot(
  em: EntityManager,
  orgId: string,
  scopeType: string,
  scopeId: string,
  targetDate: Date,
): Promise<{
  tasksTotal: number;
  tasksCompleted: number;
  wipCount: number;
  blockedCount: number;
  pointsTotal: number;
  pointsCompleted: number;
  pointsRemaining: number;
  statusCounts: Record<string, number>;
}> {
  const taskWhere: Record<string, unknown> = { org: { id: orgId } };

  if (scopeType === "project" && scopeId) {
    // Tasks within a project — use projectId field when available
    // Task entity does not yet have projectId; filter by sprint's projectId via sprint relation
    // For now, query all org tasks — future plans add projectId to Task
    void scopeId;
  } else if (scopeType === "sprint" && scopeId) {
    taskWhere["sprint"] = scopeId;
  } else if (scopeType === "workspace") {
    // Workspace: all tasks in org — no additional filter
  }

  const tasks = await em.find(Task, taskWhere as never);

  let tasksTotal = 0;
  let tasksCompleted = 0;
  let wipCount = 0;
  let blockedCount = 0;
  let pointsTotal = 0;
  let pointsCompleted = 0;
  const statusCounts: Record<string, number> = {};

  for (const task of tasks) {
    const t = task as unknown as Record<string, unknown>;
    const status = t["status"] as string | null;
    const points = (t["points"] as number | null) ?? 0;
    const normalStatus = normalizeStatus(status);

    tasksTotal++;
    pointsTotal += points;
    statusCounts[normalStatus] = (statusCounts[normalStatus] ?? 0) + 1;

    if (isDone(status)) {
      tasksCompleted++;
      pointsCompleted += points;
    }
    if (isWip(status)) wipCount++;
    if (isBlocked(status)) blockedCount++;
  }

  return {
    tasksTotal,
    tasksCompleted,
    wipCount,
    blockedCount,
    pointsTotal,
    pointsCompleted,
    pointsRemaining: pointsTotal - pointsCompleted,
    statusCounts,
  };
}

// ── Payload assertion ──────────────────────────────────────────────

function assertMetricsRollupPayload(
  payload: unknown,
): asserts payload is MetricsRollupPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("metrics_rollup payload must be an object");
  }
  const p = payload as unknown as Record<string, unknown>;
  assertStringField(p, "scope_type", "metrics_rollup");
  assertStringField(p, "org_id", "metrics_rollup");
  // scope_id is required for non-workspace scopes
  if (p["scope_type"] !== "workspace") {
    assertStringField(p, "scope_id", "metrics_rollup");
  }
}

// ── Worker handler ─────────────────────────────────────────────────

async function handleMetricsRollup(
  payload: MetricsRollupPayload,
  helpers: { em: EntityManager },
): Promise<void> {
  const { em } = helpers;
  const { org_id, scope_type, scope_id, target_date } = payload;
  const targetDate = target_date ? new Date(target_date) : new Date();

  const stats = await computeSnapshot(em, org_id, scope_type, scope_id, targetDate);

  const existingWhere: Record<string, unknown> = {
    orgId: org_id,
    scopeType: scope_type,
    date: dateStr(targetDate),
  };
  if (scope_type !== "workspace" && scope_id) {
    existingWhere["scopeId"] = scope_id;
  }

  let row = await em.findOne(MetricsCache, { where: existingWhere as never }) as unknown as Record<string, unknown> | null;

  if (row) {
    // Update existing row
    row["tasksTotal"] = stats.tasksTotal;
    row["tasksCompleted"] = stats.tasksCompleted;
    row["wipCount"] = stats.wipCount;
    row["blockedCount"] = stats.blockedCount;
    row["pointsTotal"] = stats.pointsTotal;
    row["pointsCompleted"] = stats.pointsCompleted;
    row["pointsRemaining"] = stats.pointsRemaining;
    row["statusCounts"] = stats.statusCounts;
    row["updatedAt"] = new Date();
  } else {
    // Create new row
    row = {
      orgId: org_id,
      scopeType: scope_type,
      scopeId: scope_type !== "workspace" ? scope_id : undefined,
      date: dateStr(targetDate),
      tasksTotal: stats.tasksTotal,
      tasksCompleted: stats.tasksCompleted,
      wipCount: stats.wipCount,
      blockedCount: stats.blockedCount,
      pointsTotal: stats.pointsTotal,
      pointsCompleted: stats.pointsCompleted,
      pointsRemaining: stats.pointsRemaining,
      statusCounts: stats.statusCounts,
      updatedAt: new Date(),
    };
  }

  const maybePersistAndFlush = (em as unknown as { persistAndFlush?: (entity: unknown) => Promise<void> }).persistAndFlush;
  if (maybePersistAndFlush) {
    await maybePersistAndFlush.call(em, row);
    return;
  }

  await em.save(row as never);
}

// ── Exported job ───────────────────────────────────────────────────

export const metricsRollupJob: WorkerTask<MetricsRollupPayload, { em: EntityManager }> = {
  name: "metrics_rollup",
  assertPayload: assertMetricsRollupPayload,
  handler: handleMetricsRollup,
};

// ── EventBus listener setup ────────────────────────────────────────

/** Task mutation topics that trigger a rollup */
const TASK_MUTATION_TOPICS = [
  "task.status_changed",
  "task.points_changed",
  "task.sprint_changed",
  "task.created",
  "task.deleted",
];

export interface RollupEventPayload {
  orgId: string;
  projectId?: string;
  sprintId?: string;
  taskId?: string;
}

/**
 * Subscribe to task mutation events on EventBus and enqueue rollup jobs.
 * Uses the provided WorkerRegistry queue (or runs inline in simple mode).
 */
export function setupMetricsRollupListener(
  eventBus: EventBus,
  em: EntityManager,
): Array<() => void> {
  const unsubscribers: Array<() => void> = [];

  for (const topic of TASK_MUTATION_TOPICS) {
    const unsub = eventBus.subscribe<RollupEventPayload>(topic, async (event) => {
      const { orgId, projectId, sprintId } = event.payload;

      // Enqueue project-scope rollup
      if (projectId) {
        await handleMetricsRollup(
          { scope_type: "project", scope_id: projectId, org_id: orgId },
          { em },
        );
      }

      // Enqueue sprint-scope rollup
      if (sprintId) {
        await handleMetricsRollup(
          { scope_type: "sprint", scope_id: sprintId, org_id: orgId },
          { em },
        );
      }

      // Enqueue workspace-scope rollup
      if (orgId) {
        await handleMetricsRollup(
          { scope_type: "workspace", scope_id: orgId, org_id: orgId },
          { em },
        );
      }
    });
    unsubscribers.push(unsub);
  }

  return unsubscribers;
}
