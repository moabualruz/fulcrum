import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Org } from "../../../db/entities/auth/Org.ts";
import { Event } from "../../../db/entities/core/Event.ts";
import { MetricsCache } from "../../../db/entities/tasks/MetricsCache.ts";
import { Sprint, SprintStatus } from "../../../db/entities/tasks/Sprint.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

const SprintStatusSchema = z.enum(["planned", "active", "completed"]);
const OrgIdSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);
const SprintOutputSchema = z.object({
  id: z.uuid(),
  orgId: OrgIdSchema,
  projectId: z.uuid(),
  name: z.string(),
  goal: z.string().nullable(),
  startDate: z.date(),
  endDate: z.date(),
  status: SprintStatusSchema,
  capacityPoints: z.number().int().nullable(),
  createdAt: z.date(),
});

const ListSprintsInputSchema = z.object({
  projectId: z.uuid().optional(),
  status: SprintStatusSchema.optional(),
}).optional();

const SprintIdInputSchema = z.object({ id: z.uuid() });

const CreateSprintInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1),
  goal: z.string().trim().min(1).nullable().optional(),
  startDate: z.date(),
  endDate: z.date(),
  capacityPoints: z.number().int().nonnegative().nullable().optional(),
}).refine((input) => input.startDate < input.endDate, {
  message: "start_date must be before end_date",
  path: ["endDate"],
});

const UpdateSprintInputSchema = SprintIdInputSchema.extend({
  name: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).nullable().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  capacityPoints: z.number().int().nonnegative().nullable().optional(),
}).refine((input) => {
  if (input.startDate === undefined || input.endDate === undefined) return true;
  return input.startDate < input.endDate;
}, {
  message: "start_date must be before end_date",
  path: ["endDate"],
});

const SprintTaskInputSchema = z.object({
  sprintId: z.uuid(),
  taskId: z.uuid(),
});

const CloseSprintInputSchema = SprintIdInputSchema.extend({
  unfinishedDisposition: z.enum(["next-sprint", "backlog"]),
  taskDispositions: z.array(z.object({
    taskId: z.uuid(),
    disposition: z.enum(["next-sprint", "backlog"]),
  })).optional(),
});

const MoveTaskOutputSchema = z.object({ moved: z.literal(true) });
const CloseSprintOutputSchema = z.object({
  closed: z.literal(true),
  sprint: SprintOutputSchema,
  metricsSnapshot: z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    sprintId: z.uuid(),
    completedCount: z.number().int().nonnegative(),
    pointsCompleted: z.number().int().nonnegative(),
    pointsRemaining: z.number().int().nonnegative(),
    wipCount: z.number().int().nonnegative(),
  }),
});

type SprintOutput = z.infer<typeof SprintOutputSchema>;

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return ctx.em;
}

function serializeSprint(sprint: Sprint): SprintOutput {
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

async function emitSprintEvent(ctx: {
  orgId: string;
  em: EntityManager | null;
}, input: {
  verb: "sprint.started" | "sprint.closed";
  sprint: Sprint;
  payload: Record<string, unknown>;
}): Promise<void> {
  const em = requireEntityManager(ctx);
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

async function ensureTaskProjectColumn(em: EntityManager): Promise<void> {
  await em.getConnection().execute(`alter table tasks add column if not exists project_id uuid`);
}

export const sprintsRouter = t.router({
  list: protectedProcedure
    .input(ListSprintsInputSchema)
    .output(z.array(SprintOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      const em = requireEntityManager(ctx);
      const where: Record<string, unknown> = { org: ctx.orgId };
      if (input?.projectId) where.projectId = input.projectId;
      if (input?.status) where.status = input.status;
      const sprints = await em.find(Sprint, where as never, {
        orderBy: { startDate: "ASC", id: "ASC" },
      });
      return sprints.map(serializeSprint);
    }),

  get: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      const sprint = await findSprint(requireEntityManager(ctx), ctx.orgId, input.id);
      return sprint ? serializeSprint(sprint) : null;
    }),

  create: protectedProcedure
    .input(CreateSprintInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = em.create(Sprint, {
        org: em.getReference(Org, ctx.orgId),
        projectId: input.projectId,
        name: input.name,
        goal: input.goal ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        status: SprintStatus.planned,
        capacityPoints: input.capacityPoints ?? null,
      });
      em.persist(sprint);
      await em.flush();
      return serializeSprint(sprint);
    }),

  update: protectedProcedure
    .input(UpdateSprintInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.id);
      if (!sprint) return null;
      if (input.name !== undefined) sprint.name = input.name;
      if (input.goal !== undefined) sprint.goal = input.goal;
      if (input.startDate !== undefined) sprint.startDate = input.startDate;
      if (input.endDate !== undefined) sprint.endDate = input.endDate;
      if (input.capacityPoints !== undefined) sprint.capacityPoints = input.capacityPoints;
      if (sprint.startDate >= sprint.endDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "start_date must be before end_date" });
      }
      await em.flush();
      return serializeSprint(sprint);
    }),

  delete: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.id);
      if (!sprint) return null;
      const output = serializeSprint(sprint);
      em.remove(sprint);
      await em.flush();
      return output;
    }),

  start: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.id);
      if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
      const active = await em.findOne(Sprint, {
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
      await em.flush();
      return serializeSprint(sprint);
    }),

  close: protectedProcedure
    .input(CloseSprintInputSchema)
    .output(CloseSprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.id);
      if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });

      const rows = await em.getConnection().execute(
        `select id, status, points from tasks where org_id = ? and sprint_id = ? and deleted_at is null order by id`,
        [ctx.orgId, sprint.id],
      ) as Array<{ id: string; status: string | null; points: number | null }>;
      const dispositionByTask = new Map(input.taskDispositions?.map((item) => [item.taskId, item.disposition]) ?? []);
      const unfinished = rows.filter((task) => !["done", "completed", "closed"].includes(task.status ?? ""));
      const backlogTaskIds = unfinished
        .filter((task) => (dispositionByTask.get(task.id) ?? input.unfinishedDisposition) === "backlog")
        .map((task) => task.id);
      if (backlogTaskIds.length > 0) {
        await em.getConnection().execute(
          `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id in (${backlogTaskIds.map(() => "?").join(", ")})`,
          [ctx.orgId, ...backlogTaskIds],
        );
      }

      // Move next-sprint tasks to the next planned sprint (or backlog if none)
      const nextSprintTaskIds = unfinished
        .filter((task) => (dispositionByTask.get(task.id) ?? input.unfinishedDisposition) === "next-sprint")
        .map((task) => task.id);
      if (nextSprintTaskIds.length > 0) {
        const nextSprint = await em.findOne(Sprint, {
          org: ctx.orgId,
          projectId: sprint.projectId,
          status: SprintStatus.planned,
          id: { $ne: sprint.id },
        }, { orderBy: { startDate: "ASC" } });
        const targetSprintId = nextSprint?.id ?? null;
        await em.getConnection().execute(
          `update tasks set sprint_id = ${targetSprintId ? "?" : "null"}, updated_at = now() where org_id = ? and id in (${nextSprintTaskIds.map(() => "?").join(", ")})`,
          [...(targetSprintId ? [targetSprintId] : []), ctx.orgId, ...nextSprintTaskIds],
        );
      }

      const completed = rows.filter((task) => ["done", "completed", "closed"].includes(task.status ?? ""));
      const metricsId = crypto.randomUUID();
      const metrics = em.create(MetricsCache, {
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
      em.persist(metrics);
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
      await em.flush();

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
    }),

  addTask: protectedProcedure
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.sprintId);
      if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
      await assertTaskInOrg(em, ctx.orgId, input.taskId);
      await ensureTaskProjectColumn(em);
      await em.getConnection().execute(
        `update tasks set sprint_id = ?, project_id = ?, updated_at = now() where org_id = ? and id = ?`,
        [sprint.id, sprint.projectId, ctx.orgId, input.taskId],
      );
      return { moved: true };
    }),

  removeTask: protectedProcedure
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const sprint = await findSprint(em, ctx.orgId, input.sprintId);
      if (!sprint) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found." });
      await assertTaskInOrg(em, ctx.orgId, input.taskId);
      await em.getConnection().execute(
        `update tasks set sprint_id = null, updated_at = now() where org_id = ? and id = ? and sprint_id = ?`,
        [ctx.orgId, input.taskId, sprint.id],
      );
      return { moved: true };
    }),
});

export type SprintsRouter = typeof sprintsRouter;
