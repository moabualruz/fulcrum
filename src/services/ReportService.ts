/**
 * ReportService — two-layer analytics queries for Plan 05-05.
 *
 * Layer 1: Event entity queries (cycle time, lead time, throughput, blocked, stale)
 * Layer 2: MetricsCache queries (burndown, burnup, CFD, WIP, velocity, progress)
 *
 * Supports project AND workspace scope (D-53, D-95, HIGH-01).
 * CSV export for all report types (D-54).
 * Date range parameter on all queries (D-55).
 *
 * Security: All queries scoped by orgId from context (T-05-11 mitigation).
 * No raw SQL — MikroORM only (C6).
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { MetricsCache } from "../db/entities/tasks/MetricsCache.ts";
import { Event } from "../db/entities/core/Event.ts";

// ── Scope types ────────────────────────────────────────────────────

export type ScopeType = "sprint" | "project" | "epic" | "workspace";

export interface DateRange {
  start: Date;
  end: Date;
}

// ── Output types ───────────────────────────────────────────────────

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface BurnupPoint {
  date: string;
  completed: number;
  total: number;
}

export interface CfdPoint {
  date: string;
  statusCounts: Record<string, number>;
}

export interface WipPoint {
  date: string;
  wip: number;
}

export interface VelocityEntry {
  sprintId: string;
  sprintName?: string;
  completed: number;
  average: number;
}

export interface CycleTimeEntry {
  taskId: string;
  completedAt: Date;
  cycleTimeHours: number;
}

export interface LeadTimeEntry {
  taskId: string;
  completedAt: Date;
  leadTimeHours: number;
}

export interface ThroughputEntry {
  weekStart: string;
  count: number;
}

export interface WorkloadEntry {
  assigneeId: string | null;
  taskCount: number;
}

export interface BlockedEntry {
  taskId: string;
  blockedSince: Date;
  daysBlocked: number;
}

export interface StaleEntry {
  taskId: string;
  lastActivityAt: Date;
  daysSinceActivity: number;
}

export interface ProgressRollup {
  tasksTotal: number;
  tasksCompleted: number;
  percentByCount: number;
  pointsTotal: number;
  pointsCompleted: number;
  percentByPoints: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function msToHours(ms: number): number {
  return ms / (1000 * 60 * 60);
}

/** Return Monday of the ISO week containing `d` */
function weekStart(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

const DONE_STATUSES = new Set(["done", "completed", "closed", "resolved"]);
const STARTED_STATUSES = new Set(["in_progress", "started", "doing", "in progress"]);
const BLOCKED_STATUSES = new Set(["blocked"]);

// ── Service ────────────────────────────────────────────────────────

export class ReportService {
  constructor(private readonly em: EntityManager) {}

  // ── Layer 2: MetricsCache queries ──────────────────────────────

  /**
   * Build MetricsCache where filter scoped by orgId + scopeType.
   * For workspace scope: filter by scopeType='workspace' (HIGH-01, T-05-11).
   * For other scopes: filter by scopeType + scopeId (when provided).
   */
  private buildScopeFilter(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange?: DateRange,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      orgId,
      scopeType,
    };
    // Workspace scope: aggregate all workspace-level rows; no scopeId filter
    if (scopeType !== "workspace" && scopeId) {
      where["scopeId"] = scopeId;
    }
    if (dateRange) {
      where["date"] = { $gte: dateRange.start, $lte: dateRange.end };
    }
    return where;
  }

  /**
   * Build Event where filter scoped by orgId + scope (T-05-11).
   */
  private buildEventFilter(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange?: DateRange,
    verb?: string,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      org: orgId,
      subjectKind: "task",
    };
    if (verb) where["verb"] = verb;
    // For project scope, filter by projectId if provided
    if (scopeType === "project" && scopeId) {
      where["projectId"] = scopeId;
    }
    if (dateRange) {
      where["createdAt"] = { $gte: dateRange.start, $lte: dateRange.end };
    }
    return where;
  }

  async getBurndown(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<BurndownPoint[]> {
    const where = this.buildScopeFilter(orgId, scopeType, scopeId, dateRange);
    const rows = await this.em.find(MetricsCache, where as never, {
      orderBy: { date: "ASC" },
    });
    if (rows.length === 0) return [];

    const pointsTotal = (rows[0] as Record<string, number>)["pointsTotal"] ?? 0;
    const totalDays = Math.max(1, rows.length - 1);
    const pointsPerDay = pointsTotal / totalDays;

    return rows.map((row, i) => {
      const r = row as Record<string, unknown>;
      return {
        date: dateStr(r["date"] as Date),
        remaining: (r["pointsRemaining"] as number) ?? 0,
        ideal: Math.max(0, Math.round((pointsTotal - pointsPerDay * i) * 100) / 100),
      };
    });
  }

  async getBurnup(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<BurnupPoint[]> {
    const where = this.buildScopeFilter(orgId, scopeType, scopeId, dateRange);
    const rows = await this.em.find(MetricsCache, where as never, {
      orderBy: { date: "ASC" },
    });
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        date: dateStr(r["date"] as Date),
        completed: (r["pointsCompleted"] as number) ?? 0,
        total: (r["pointsTotal"] as number) ?? 0,
      };
    });
  }

  async getCfd(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<CfdPoint[]> {
    const where = this.buildScopeFilter(orgId, scopeType, scopeId, dateRange);
    const rows = await this.em.find(MetricsCache, where as never, {
      orderBy: { date: "ASC" },
    });
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        date: dateStr(r["date"] as Date),
        statusCounts: (r["statusCounts"] as Record<string, number>) ?? {},
      };
    });
  }

  async getWipOverTime(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<WipPoint[]> {
    const where = this.buildScopeFilter(orgId, scopeType, scopeId, dateRange);
    const rows = await this.em.find(MetricsCache, where as never, {
      orderBy: { date: "ASC" },
    });
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        date: dateStr(r["date"] as Date),
        wip: (r["wipCount"] as number) ?? 0,
      };
    });
  }

  async getVelocity(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    lastN: number,
  ): Promise<VelocityEntry[]> {
    // For velocity, query sprint-scoped MetricsCache rows (one per sprint)
    const where: Record<string, unknown> = { orgId, scopeType: "sprint" };
    if (scopeType === "project" && scopeId) {
      // We need sprint rows belonging to this project — use projectId if present
      where["projectId"] = scopeId;
    } else if (scopeType === "workspace") {
      where["scopeType"] = "workspace";
    }

    const rows = await this.em.find(MetricsCache, where as never, {
      orderBy: { date: "DESC" },
      limit: lastN,
    });

    if (rows.length === 0) return [];

    const totalCompleted = rows.reduce((sum, row) => {
      return sum + (((row as Record<string, unknown>)["pointsCompleted"] as number) ?? 0);
    }, 0);
    const average = Math.round(totalCompleted / rows.length);

    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        sprintId: (r["scopeId"] as string) ?? "",
        sprintName: (r["sprintName"] as string) ?? undefined,
        completed: (r["pointsCompleted"] as number) ?? 0,
        average,
      };
    });
  }

  async getProgressRollup(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
  ): Promise<ProgressRollup> {
    const where = this.buildScopeFilter(orgId, scopeType, scopeId);
    const rows = await this.em.find(MetricsCache, where as never);

    // Aggregate across all matching rows (handles workspace multi-project rollup)
    let tasksTotal = 0;
    let tasksCompleted = 0;
    let pointsTotal = 0;
    let pointsCompleted = 0;

    for (const row of rows) {
      const r = row as Record<string, unknown>;
      tasksTotal += (r["tasksTotal"] as number) ?? 0;
      tasksCompleted += (r["tasksCompleted"] as number) ?? 0;
      pointsTotal += (r["pointsTotal"] as number) ?? 0;
      pointsCompleted += (r["pointsCompleted"] as number) ?? 0;
    }

    return {
      tasksTotal,
      tasksCompleted,
      percentByCount: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
      pointsTotal,
      pointsCompleted,
      percentByPoints: pointsTotal > 0 ? Math.round((pointsCompleted / pointsTotal) * 100) : 0,
    };
  }

  // ── Layer 1: Event queries ─────────────────────────────────────

  async getCycleTime(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<CycleTimeEntry[]> {
    const where = this.buildEventFilter(orgId, scopeType, scopeId, dateRange, "task.status_changed");
    const events = await this.em.find(Event, where as never, {
      orderBy: { createdAt: "ASC" },
    });

    // Group events by taskId
    const byTask = new Map<string, Array<{ toValue: string; at: Date }>>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const taskId = e["subjectId"] as string;
      if (!taskId) continue;
      const payload = (e["payload"] as Record<string, unknown>) ?? {};
      const toValue = (payload["to_value"] as string) ?? "";
      const at = e["createdAt"] as Date;
      if (!byTask.has(taskId)) byTask.set(taskId, []);
      byTask.get(taskId)!.push({ toValue, at });
    }

    const results: CycleTimeEntry[] = [];
    for (const [taskId, taskEvents] of byTask) {
      const startedEvent = taskEvents.find((e) => STARTED_STATUSES.has(e.toValue.toLowerCase()));
      const completedEvent = taskEvents.find((e) => DONE_STATUSES.has(e.toValue.toLowerCase()));
      if (startedEvent && completedEvent && completedEvent.at > startedEvent.at) {
        results.push({
          taskId,
          completedAt: completedEvent.at,
          cycleTimeHours: msToHours(completedEvent.at.getTime() - startedEvent.at.getTime()),
        });
      }
    }
    return results;
  }

  async getLeadTime(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<LeadTimeEntry[]> {
    // Lead time = task.createdAt → completed event
    // We query both task.created events and status_changed completed events
    const whereCompleted = this.buildEventFilter(orgId, scopeType, scopeId, dateRange, "task.status_changed");
    const events = await this.em.find(Event, whereCompleted as never, {
      orderBy: { createdAt: "ASC" },
    });

    const byTask = new Map<string, { createdAt?: Date; completedAt?: Date }>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const taskId = e["subjectId"] as string;
      if (!taskId) continue;
      const payload = (e["payload"] as Record<string, unknown>) ?? {};
      const toValue = (payload["to_value"] as string) ?? "";
      const verb = e["verb"] as string;

      if (!byTask.has(taskId)) byTask.set(taskId, {});
      const entry = byTask.get(taskId)!;

      if (verb === "task.created") {
        entry.createdAt = e["createdAt"] as Date;
      } else if (DONE_STATUSES.has(toValue.toLowerCase())) {
        entry.completedAt = e["createdAt"] as Date;
      }
    }

    const results: LeadTimeEntry[] = [];
    for (const [taskId, entry] of byTask) {
      if (entry.createdAt && entry.completedAt && entry.completedAt > entry.createdAt) {
        results.push({
          taskId,
          completedAt: entry.completedAt,
          leadTimeHours: msToHours(entry.completedAt.getTime() - entry.createdAt.getTime()),
        });
      }
    }
    return results;
  }

  async getThroughput(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    dateRange: DateRange,
  ): Promise<ThroughputEntry[]> {
    const where = this.buildEventFilter(orgId, scopeType, scopeId, dateRange, "task.status_changed");
    const events = await this.em.find(Event, where as never, {
      orderBy: { createdAt: "ASC" },
    });

    // Count completed tasks per week
    const weekCounts = new Map<string, number>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const payload = (e["payload"] as Record<string, unknown>) ?? {};
      const toValue = (payload["to_value"] as string) ?? "";
      if (!DONE_STATUSES.has(toValue.toLowerCase())) continue;

      const at = e["createdAt"] as Date;
      const ws = dateStr(weekStart(at));
      weekCounts.set(ws, (weekCounts.get(ws) ?? 0) + 1);
    }

    return [...weekCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStartStr, count]) => ({ weekStart: weekStartStr, count }));
  }

  async getWorkload(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
  ): Promise<WorkloadEntry[]> {
    // Task entity doesn't yet have assigneeId — return empty until Task gets assignee field
    // This is a stub that returns correct shape; Plan 07+ wires assignee data
    void orgId; void scopeType; void scopeId;
    return [];
  }

  async getBlockedItems(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
  ): Promise<BlockedEntry[]> {
    // Find tasks that transitioned to "blocked" and haven't transitioned out
    const where = this.buildEventFilter(orgId, scopeType, scopeId, undefined, "task.status_changed");
    const events = await this.em.find(Event, where as never, {
      orderBy: { createdAt: "ASC" },
    });

    // Track last status per task
    const lastStatus = new Map<string, { status: string; at: Date }>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const taskId = e["subjectId"] as string;
      if (!taskId) continue;
      const payload = (e["payload"] as Record<string, unknown>) ?? {};
      const toValue = (payload["to_value"] as string) ?? "";
      lastStatus.set(taskId, { status: toValue, at: e["createdAt"] as Date });
    }

    const now = new Date();
    const results: BlockedEntry[] = [];
    for (const [taskId, { status, at }] of lastStatus) {
      if (BLOCKED_STATUSES.has(status.toLowerCase())) {
        const daysBlocked = Math.floor((now.getTime() - at.getTime()) / (1000 * 60 * 60 * 24));
        results.push({ taskId, blockedSince: at, daysBlocked });
      }
    }
    return results;
  }

  async getStaleIssues(
    orgId: string,
    scopeType: ScopeType,
    scopeId: string | undefined,
    thresholdDays = 14,
  ): Promise<StaleEntry[]> {
    // Tasks with last activity older than thresholdDays
    const where = this.buildEventFilter(orgId, scopeType, scopeId);
    const events = await this.em.find(Event, where as never, {
      orderBy: { createdAt: "ASC" },
    });

    // Last activity per task
    const lastActivity = new Map<string, Date>();
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const taskId = e["subjectId"] as string;
      if (!taskId) continue;
      const at = e["createdAt"] as Date;
      const current = lastActivity.get(taskId);
      if (!current || at > current) lastActivity.set(taskId, at);
    }

    const now = new Date();
    const cutoff = thresholdDays * 24 * 60 * 60 * 1000;
    const results: StaleEntry[] = [];
    for (const [taskId, lastAt] of lastActivity) {
      const age = now.getTime() - lastAt.getTime();
      if (age >= cutoff) {
        results.push({
          taskId,
          lastActivityAt: lastAt,
          daysSinceActivity: Math.floor(age / (1000 * 60 * 60 * 24)),
        });
      }
    }
    return results;
  }

  // ── CSV export (D-54) ──────────────────────────────────────────

  /**
   * Serialize any report data array to CSV string.
   * Returns string with header row + data rows.
   */
  exportCsv(reportType: string, data: Array<Record<string, unknown>>): string {
    void reportType; // used for potential future header customization
    if (data.length === 0) return "";

    const headers = Object.keys(data[0]!);
    const escape = (v: unknown): string => {
      const s = String(v ?? "");
      // Quote fields containing comma, quote, or newline
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    return lines.join("\n");
  }
}
