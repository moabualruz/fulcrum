import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { SprintService } from "../../../services/SprintService.ts";

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

function requireService(ctx: { em: EntityManager | null }): SprintService {
  if (!ctx.em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
  }
  return new SprintService(ctx.em);
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const sprintsRouter = t.router({
  list: protectedProcedure
    .input(ListSprintsInputSchema)
    .output(z.array(SprintOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return requireService(ctx).list(ctx.orgId, input ?? undefined);
    }),

  get: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      return requireService(ctx).get(ctx.orgId, input.id);
    }),

  create: protectedProcedure
    .input(CreateSprintInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).create(ctx.orgId, input);
    }),

  update: protectedProcedure
    .input(UpdateSprintInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).update(ctx.orgId, input);
    }),

  delete: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).delete(ctx.orgId, input.id);
    }),

  start: protectedProcedure
    .input(SprintIdInputSchema)
    .output(SprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).start(ctx, input.id);
    }),

  close: protectedProcedure
    .input(CloseSprintInputSchema)
    .output(CloseSprintOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).close(ctx, input);
    }),

  addTask: protectedProcedure
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).addTask(ctx.orgId, input.sprintId, input.taskId);
    }),

  removeTask: protectedProcedure
    .input(SprintTaskInputSchema)
    .output(MoveTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).removeTask(ctx.orgId, input.sprintId, input.taskId);
    }),
});

export type SprintsRouter = typeof sprintsRouter;
