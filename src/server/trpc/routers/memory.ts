import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createMemory, deleteMemory, updateMemory } from "../../../application/memory/commands.ts";
import { getMemory, listMemories, searchMemories } from "../../../application/memory/queries.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import {
  MEMORY_IMPORTANCE,
  MEMORY_KINDS,
  MEMORY_SOURCES,
} from "../../../db/entities/memory/enums.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const MemoryKindSchema = z.enum(MEMORY_KINDS);
const MemoryImportanceSchema = z.enum(MEMORY_IMPORTANCE);
const MemorySourceSchema = z.enum(MEMORY_SOURCES);

const MemoryOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  projectId: z.uuid().nullable(),
  global: z.boolean(),
  kind: MemoryKindSchema,
  body: z.string(),
  tags: z.array(z.string()),
  importance: MemoryImportanceSchema,
  source: MemorySourceSchema,
  sourceRef: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
  archived: z.boolean(),
});

const RankedMemoryOutputSchema = MemoryOutputSchema.extend({
  textRank: z.number(),
  recencyBoost: z.number(),
  importanceBoost: z.number(),
  score: z.number(),
});

const IdInputSchema = z.object({ id: z.uuid() });

const CreateMemoryInputSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  global: z.boolean().optional(),
  kind: MemoryKindSchema.optional(),
  body: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  source: z.literal("manual").optional(),
  sourceRef: z.record(z.string(), z.unknown()).optional(),
}).strict();

const ListMemoriesInputSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  global: z.boolean().optional(),
  kind: MemoryKindSchema.optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  archived: z.boolean().optional(),
  source: MemorySourceSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
}).optional();

const UpdateMemoryInputSchema = IdInputSchema.extend({
  body: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  forceEdit: z.boolean().optional(),
}).strict();

const DeleteMemoryOutputSchema = z.object({ deleted: z.literal(true) });

const SearchMemoryInputSchema = z.object({
  query: z.string().default(""),
  projectId: z.uuid().nullable().optional(),
  global: z.boolean().optional(),
  kind: MemoryKindSchema.optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  archived: z.boolean().optional(),
  source: MemorySourceSchema.optional(),
  topK: z.number().int().positive().max(100).optional(),
  now: z.string().datetime().optional(),
}).strict();

const memoryApplication = {
  createMemory,
  getMemory,
  listMemories,
  updateMemory,
  deleteMemory,
  searchMemories,
};

export function __setMemoryApplicationForTest(overrides: Partial<typeof memoryApplication>): () => void {
  const previous = { ...memoryApplication };
  Object.assign(memoryApplication, overrides);
  return () => Object.assign(memoryApplication, previous);
}

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (ctx.em) return ctx.em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }) {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const memoryRouter = t.router({
  create: permissionedProcedure({ resource: "memories", action: "create" })
    .input(CreateMemoryInputSchema)
    .output(MemoryOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => memoryApplication.createMemory(requireEntityManager(ctx), appContext(ctx), input))
    ),

  get: permissionedProcedure({ resource: "memories", action: "get" })
    .input(IdInputSchema)
    .output(MemoryOutputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() => memoryApplication.getMemory(requireEntityManager(ctx), appContext(ctx), input.id))
    ),

  list: permissionedProcedure({ resource: "memories", action: "list" })
    .input(ListMemoriesInputSchema)
    .output(z.array(MemoryOutputSchema))
    .query(({ ctx, input }) =>
      ctx.em
        ? mapAppError(() => memoryApplication.listMemories(requireEntityManager(ctx), appContext(ctx), input ?? {}))
        : []
    ),

  update: permissionedProcedure({ resource: "memories", action: "update" })
    .input(UpdateMemoryInputSchema)
    .output(MemoryOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => memoryApplication.updateMemory(requireEntityManager(ctx), appContext(ctx), input))
    ),

  delete: permissionedProcedure({ resource: "memories", action: "delete" })
    .input(IdInputSchema)
    .output(DeleteMemoryOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => memoryApplication.deleteMemory(requireEntityManager(ctx), appContext(ctx), input.id))
    ),

  search: permissionedProcedure({ resource: "memories", action: "search" })
    .input(SearchMemoryInputSchema)
    .output(z.array(RankedMemoryOutputSchema))
    .query(({ ctx, input }) =>
      ctx.em
        ? mapAppError(() => memoryApplication.searchMemories(requireEntityManager(ctx), appContext(ctx), input))
        : []
    ),
});

export type MemoryRouter = typeof memoryRouter;
