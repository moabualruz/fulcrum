import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  addTaskToSprint,
  closeSprint,
  createSprint,
  deleteSprint,
  removeTaskFromSprint,
  startSprint,
  updateSprint,
} from "@work-management/application/sprints/commands.ts";
import { getSprint, listSprints } from "@work-management/application/sprints/queries.ts";
import type { AppContext } from "@work-management/application/sprints/types.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { optionalTrpcEntityManager } from "@fulcrum/server/trpc/context.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

// ── Schemas ────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const em = (ctx as Record<string, unknown>)["em"] as EntityManager | null | undefined;
  if (!em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
  }
  return em;
}

function appContext(ctx: { orgId: string; userId: string }): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const sprintsRouter = t.router({
  list: permissionedProcedure({ resource: "sprints", action: "list" })
    .input(ListSprintsInputSchema)
    .output(z.array(SprintOutputSchema))
    .query(async ({ ctx, input }) => {
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return [];
      return mapAppError(() => listSprints(em, appContext(ctx), input ?? undefined));
    }),

  get: permissionedProcedure({ resource: "sprints", action: "get" })
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getSprint(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  create: permissionedProcedure({ resource: "sprints", action: "create" })
    .input(CreateSprintInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => createSprint(requireEntityManager(ctx), appContext(ctx), input));
    }),

  update: permissionedProcedure({ resource: "sprints", action: "update" })
    .input(UpdateSprintInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => updateSprint(requireEntityManager(ctx), appContext(ctx), input));
    }),

  delete: permissionedProcedure({ resource: "sprints", action: "delete" })
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => deleteSprint(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  start: permissionedProcedure({ resource: "sprints", action: "start" })
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => startSprint(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  close: permissionedProcedure({ resource: "sprints", action: "close" })
    .input(CloseSprintInputSchema)
    .output(CloseSprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => closeSprint(requireEntityManager(ctx), appContext(ctx), input));
    }),

  addTask: permissionedProcedure({ resource: "sprints", action: "addTask" })
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => addTaskToSprint(requireEntityManager(ctx), appContext(ctx), input.sprintId, input.taskId));
    }),

  removeTask: permissionedProcedure({ resource: "sprints", action: "removeTask" })
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => removeTaskFromSprint(requireEntityManager(ctx), appContext(ctx), input.sprintId, input.taskId));
    }),
});

export type SprintsRouter = typeof sprintsRouter;
