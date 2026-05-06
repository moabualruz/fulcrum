import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../db/entities/auth/Org.ts";
import { Event } from "../db/entities/core/Event.ts";
import { MetricsCache } from "../db/entities/tasks/MetricsCache.ts";
import { Sprint, SprintStatus } from "../db/entities/tasks/Sprint.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface SprintOutput {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: Date;
  endDate: Date;
  status: "planned" | "active" | "completed";
  capacityPoints: number | null;
  createdAt: Date;
}

export interface MetricsSnapshot {
  id: string;
  projectId: string;
  sprintId: string;
  completedCount: number;
  pointsCompleted: number;
  pointsRemaining: number;
  wipCount: number;
}

export interface CloseSprintResult {
  closed: true;
  sprint: SprintOutput;
  metricsSnapshot: MetricsSnapshot;
}

interface SprintContext {
  orgId: string;
  em: EntityManager | null;
}

// ── Service ────────────────────────────────────────────────────────

export class SprintService {
  constructor(private readonly em: EntityManager) {}

  // ── Queries ────────────────────────────────────────────────────

  async list(orgId: string, input?: {
    projectId?: string;
    status?: string;
  }): Promise<SprintOutput[]> {
    const where: Record<string, unknown> = { org: orgId };
    if (input?.projectId) where.projectId = input.projectId;
    if (input?.status) where.status = input.status;
    const sprints = await this.em.find(Sprint, where as never, {
      orderBy: { startDate: "ASC", id: "ASC" },
    });
    return sprints.map(serializeSprint);
  }

  async get(orgId: string, id: string): Promise<SprintOutput | null> {
    const sprint = await findSprint(this.em, orgId, id);
    return sprint ? serializeSprint(sprint) : null;
  }

  // ── Mutations ──────────────────────────────────────────────────

  async create(orgId: string, input: {
    projectId: string;
    name: string;
    goal?: string | null;
    startDate: Date;
    endDate: Date;
    capacityPoints?: number | null;
  }): Promise<SprintOutput> {
    const sprint = this.em.create(Sprint, {
      org: this.em.getReference(Org, orgId),
      projectId: input.projectId,
      name: input.name,
      goal: input.goal ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      status: SprintStatus.planned,
      capacityPoints: input.capacityPoints ?? null,
    });
    this.em.persist(sprint);
    await this.em.flush();
    return serializeSprint(sprint);
  }

  async update(orgId: string, input: {
    id: string;
    name?: string;
    goal?: string | null;
    startDate?: Date;
    endDate?: Date;
    capacityPoints?: number | null;
  }): Promise<SprintOutput | null> {
    const sprint = await findSprint(this.em, orgId, input.id);
    if (!sprint) return null;
    if (input.name !== undefined) sprint.name = input.name;
    if (input.goal !== undefined) sprint.goal = input.goal;
    if (input.startDate !== undefined) sprint.startDate = input.startDate;
    if (input.endDate !== undefined) sprint.endDate = input.endDate;
    if (input.capacityPoints !== undefined) sprint.capacityPoints = input.capacityPoints;
    if (sprint.startDate >= sprint.endDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "start_date must be before end_date" });
    }
    await this.em.flush();
    return serializeSprint(sprint);
  }

  async delete(orgId: string, id: string): Promise<SprintOutput | null> {
    const sprint = await findSprint(this.em, orgId, id);
    if (!sprint) return null;
    const output = serializeSprint(sprint);
    this.em.remove(sprint);
    await this.em.flush();
    return output;
  }

  async start(ctx: SprintContext, id: string): Promise<SprintOutput> {
    const sprint = await findSprint(this.em, ctx.orgId, id);
    if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
    const active = await this.em.findOne(Sprint, {
      org: ctx.orgId,
      projectId: sprint.projectId,
      status: SprintStatus.active,
      id: { $ne: sprint.id },
    } as never);
    if (active) {
      throw new TRPCError({ code: "CONFLICT", message: "at_most_one_active" });
    }
    sprint.status = SprintStatus.active;
    await emitSprintEvent(ctx, {
      verb: "sprint.started",
      sprint,
      payload: { sprint_id: sprint.id, project_id: sprint.projectId, org_id: ctx.orgId },
    });
    await this.em.flush();
    return serializeSprint(sprint);
  }

  async close(ctx: SprintContext, input: {
    id: string;
    unfinishedDisposition: "next-sprint" | "backlog";
    taskDispositions?: Array<{ taskId: string; disposition: "next-sprint" | "backlog" }>;
  }): Promise<CloseSprintResult> {
    const sprint = await findSprint(this.em, ctx.orgId, input.id);
    if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });

    const rows = await this.em.getConnection().execute(
      `select id, status, points from tasks where org_id = ? and sprint_id = ? and deleted_at is null order by id`,
      [ctx.orgId, sprint.id],
    ) as Array<{ id: string; status: string | null; points: number | null }>;

    const dispositionByTask = new Map(input.taskDispositions?.map((item) => [item.taskId, item.disposition]) ?? []);
    const unfinished = rows.filter((task) => !["done", "completed", "closed"].includes(task.status ?? ""));

    // Move backlog tasks
    const backlogTaskIds = unfinished
      .filter((task) => (dispositionByTask.get(task.id) ?? input.unfinishedDisposition) === "backlog")
      .map((task) => task.id);
    if (backlogTaskIds.length > 0) {
      await this.em.getConnection().execute(
        `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id in (${backlogTaskIds.map(() => "?").join(", ")})`,
        [ctx.orgId, ...backlogTaskIds],
      );
    }

    // Move next-sprint tasks to the next planned sprint (or backlog if none)
    const nextSprintTaskIds = unfinished
      .filter((task) => (dispositionByTask.get(task.id) ?? input.unfinishedDisposition) === "next-sprint")
      .map((task) => task.id);
    if (nextSprintTaskIds.length > 0) {
      const nextSprint = await this.em.findOne(Sprint, {
        org: ctx.orgId,
        projectId: sprint.projectId,
        status: SprintStatus.planned,
        id: { $ne: sprint.id },
      }, { orderBy: { startDate: "ASC" } });
      const targetSprintId = nextSprint?.id ?? null;
      await this.em.getConnection().execute(
        `update tasks set sprint_id = ${targetSprintId ? "?" : "null"}, updated_at = now() where org_id = ? and id in (${nextSprintTaskIds.map(() => "?").join(", ")})`,
        [...(targetSprintId ? [targetSprintId] : []), ctx.orgId, ...nextSprintTaskIds],
      );
    }

    const completed = rows.filter((task) => ["done", "completed", "closed"].includes(task.status ?? ""));
    const metricsId = crypto.randomUUID();
    const metrics = this.em.create(MetricsCache, {
      id: metricsId,
      projectId: sprint.projectId,
      sprint,
      date: new Date(),
      startedCount: rows.length,
      completedCount: completed.length,
      blockedCount: rows.filter((task) => task.status === "blocked").length,
      pointsCompleted: completed.reduce((sum, task) => sum + (task.points ?? 0), 0),
      pointsRemaining: unfinished.reduce((sum, task) => sum + (task.points ?? 0), 0),
      wipCount: rows.filter((task) => ["in_progress", "active"].includes(task.status ?? "")).length,
    });
    sprint.status = SprintStatus.completed;
    this.em.persist(metrics);
    await emitSprintEvent(ctx, {
      verb: "sprint.closed",
      sprint,
      payload: {
        sprint_id: sprint.id,
        project_id: sprint.projectId,
        org_id: ctx.orgId,
        metrics_snapshot: {
          id: metrics.id,
          project_id: metrics.projectId,
          sprint_id: sprint.id,
          completed_count: metrics.completedCount,
          points_completed: metrics.pointsCompleted,
          points_remaining: metrics.pointsRemaining,
          wip_count: metrics.wipCount,
        },
      },
    });
    await this.em.flush();

    return {
      closed: true,
      sprint: serializeSprint(sprint),
      metricsSnapshot: {
        id: metrics.id,
        projectId: metrics.projectId,
        sprintId: sprint.id,
        completedCount: metrics.completedCount,
        pointsCompleted: metrics.pointsCompleted,
        pointsRemaining: metrics.pointsRemaining,
        wipCount: metrics.wipCount,
      },
    };
  }

  // D-27: Capacity preview — sum story_points of tasks in sprint vs capacity budget
  async getCapacityPreview(orgId: string, sprintId: string): Promise<{
    assigned: number;
    capacity: number | null;
    percentage: number | null;
  }> {
    const sprint = await findSprint(this.em, orgId, sprintId);
    if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });

    const rows = await this.em.getConnection().execute(
      `select coalesce(sum(points), 0) as total_points from tasks where org_id = ? and sprint_id = ? and deleted_at is null`,
      [orgId, sprintId],
    ) as Array<{ total_points: number }>;

    const assigned = Number(rows[0]?.total_points ?? 0);
    const capacity = sprint.capacityPoints ?? null;
    const percentage = capacity && capacity > 0 ? (assigned / capacity) * 100 : null;

    return { assigned, capacity, percentage };
  }

  // D-29: Save retrospective notes + summary
  async saveRetrospective(orgId: string, sprintId: string, notes: string, summary?: string): Promise<SprintOutput | null> {
    const sprint = await findSprint(this.em, orgId, sprintId);
    if (!sprint) return null;

    sprint.retrospectiveNotes = { notes };
    if (summary !== undefined) {
      sprint.closedSummary = { ...(sprint.closedSummary as Record<string, unknown> ?? {}), summary };
    }
    await this.em.flush();
    return serializeSprint(sprint);
  }

  async addTask(orgId: string, sprintId: string, taskId: string): Promise<{ moved: true }> {
    const sprint = await findSprint(this.em, orgId, sprintId);
    if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
    await assertTaskInOrg(this.em, orgId, taskId);
    await this.em.getConnection().execute(
      `update tasks
       set sprint_id = ?,
           project_id = case
             when exists (select 1 from projects where org_id = ? and id = ?) then ?
             else project_id
           end,
           updated_at = now()
       where org_id = ? and id = ?`,
      [sprint.id, orgId, sprint.projectId, sprint.projectId, orgId, taskId],
    );
    return { moved: true };
  }

  async removeTask(orgId: string, sprintId: string, taskId: string): Promise<{ moved: true }> {
    const sprint = await findSprint(this.em, orgId, sprintId);
    if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
    await assertTaskInOrg(this.em, orgId, taskId);
    await this.em.getConnection().execute(
      `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id = ? and sprint_id = ?`,
      [orgId, taskId, sprint.id],
    );
    return { moved: true };
  }
}

// ── Pure helpers (moved from router) ─────────────────────────────

export function serializeSprint(sprint: Sprint): SprintOutput {
  return {
    id: sprint.id,
    orgId: sprint.org.id,
    projectId: sprint.projectId,
    name: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    status: sprint.status,
    capacityPoints: sprint.capacityPoints,
    createdAt: sprint.createdAt,
  };
}

async function findSprint(em: EntityManager, orgId: string, id: string): Promise<Sprint | null> {
  return em.findOne(Sprint, { org: orgId, id } as never);
}

async function emitSprintEvent(ctx: SprintContext, input: {
  verb: "sprint.started" | "sprint.closed";
  sprint: Sprint;
  payload: Record<string, unknown>;
}): Promise<void> {
  const em = ctx.em;
  if (!em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
  }
  const event = em.create(Event, {
    org: em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "sprint",
    subjectId: input.sprint.id,
    payload: input.payload,
    createdAt: new Date(),
  });
  em.persist(event);
}

async function assertTaskInOrg(em: EntityManager, orgId: string, taskId: string): Promise<void> {
  const rows = await em.getConnection().execute(
    `select id from tasks where org_id = ? and id = ? and deleted_at is null`,
    [orgId, taskId],
  );
  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
  }
}
