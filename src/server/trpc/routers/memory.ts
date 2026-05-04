import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Org } from "../../../db/entities/auth/Org.ts";
import { Memory } from "../../../db/entities/memory/Memory.ts";
import {
  MEMORY_IMPORTANCE,
  MEMORY_KINDS,
  MEMORY_SOURCES,
} from "../../../db/entities/memory/enums.ts";
import { rankMemoryMatches } from "../../../memory/retrieval/scoring.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

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

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return ctx.em;
}

function serializeMemory(memory: Memory): z.infer<typeof MemoryOutputSchema> {
  return {
    id: memory.id,
    orgId: memory.org.id,
    projectId: memory.projectId,
    global: memory.global,
    kind: memory.kind,
    body: memory.body,
    tags: memory.tags,
    importance: memory.importance,
    source: memory.source,
    sourceRef: memory.sourceRef,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    archived: memory.archived,
  };
}

async function findMemoryOrThrow(
  em: EntityManager,
  orgId: string,
  id: string,
): Promise<Memory> {
  const memory = await em.findOne(Memory, { org: orgId, id } as never);
  if (!memory) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found." });
  }
  return memory;
}

function listWhere(
  orgId: string,
  input: z.infer<typeof ListMemoriesInputSchema> | z.infer<typeof SearchMemoryInputSchema>,
) {
  return {
    org: orgId,
    ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input?.global !== undefined ? { global: input.global } : {}),
    ...(input?.kind ? { kind: input.kind } : {}),
    ...(input?.importance ? { importance: input.importance } : {}),
    ...(input?.archived !== undefined ? { archived: input.archived } : { archived: false }),
    ...(input?.source ? { source: input.source } : {}),
  };
}

function filterTags<TMemory extends Memory>(
  memories: TMemory[],
  tags: readonly string[] | undefined,
): TMemory[] {
  if (!tags?.length) return memories;
  return memories.filter((memory) => tags.every((tag) => memory.tags.includes(tag)));
}

export const memoryRouter = t.router({
  create: permissionedProcedure({ resource: "memories", action: "create" })
    .input(CreateMemoryInputSchema)
    .output(MemoryOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const now = new Date();
      const memory = em.create(Memory, {
        org: em.getReference(Org, ctx.orgId),
        projectId: input.projectId ?? null,
        global: input.global ?? false,
        kind: input.kind ?? "note",
        body: input.body,
        tags: input.tags ?? [],
        importance: input.importance ?? "medium",
        source: "manual",
        sourceRef: input.sourceRef ?? {},
        createdAt: now,
        updatedAt: now,
        archived: false,
      });
      em.persist(memory);
      await em.flush();
      return serializeMemory(memory);
    }),

  get: permissionedProcedure({ resource: "memories", action: "get" })
    .input(IdInputSchema)
    .output(MemoryOutputSchema)
    .query(async ({ ctx, input }) => {
      const memory = await findMemoryOrThrow(requireEntityManager(ctx), ctx.orgId, input.id);
      return serializeMemory(memory);
    }),

  list: permissionedProcedure({ resource: "memories", action: "list" })
    .input(ListMemoriesInputSchema)
    .output(z.array(MemoryOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      const em = requireEntityManager(ctx);
      const memories = await em.find(Memory, listWhere(ctx.orgId, input), {
        orderBy: { createdAt: "DESC", id: "ASC" },
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      } as never);
      return filterTags(memories, input?.tags).map(serializeMemory);
    }),

  update: permissionedProcedure({ resource: "memories", action: "update" })
    .input(UpdateMemoryInputSchema)
    .output(MemoryOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const memory = await findMemoryOrThrow(em, ctx.orgId, input.id);
      if (memory.source !== "manual" && input.forceEdit !== true) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Non-manual memories require explicit forceEdit confirmation.",
        });
      }

      if (input.body !== undefined) memory.body = input.body;
      if (input.tags !== undefined) memory.tags = input.tags;
      if (input.importance !== undefined) memory.importance = input.importance;
      memory.updatedAt = new Date();
      em.persist(memory);
      await em.flush();
      return serializeMemory(memory);
    }),

  delete: permissionedProcedure({ resource: "memories", action: "delete" })
    .input(IdInputSchema)
    .output(DeleteMemoryOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const memory = await findMemoryOrThrow(em, ctx.orgId, input.id);
      em.remove(memory);
      await em.flush();
      return { deleted: true as const };
    }),

  search: permissionedProcedure({ resource: "memories", action: "search" })
    .input(SearchMemoryInputSchema)
    .output(z.array(RankedMemoryOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      const em = requireEntityManager(ctx);
      const candidates = await em.find(Memory, listWhere(ctx.orgId, input), {
        orderBy: { createdAt: "DESC", id: "ASC" },
      } as never);
      return rankMemoryMatches(
        input.query,
        filterTags(candidates, input.tags),
        {
          topK: input.topK ?? 20,
          now: input.now ? new Date(input.now) : undefined,
        },
      ).map((row) => ({
        ...serializeMemory(row.memory),
        textRank: row.textRank,
        recencyBoost: row.recencyBoost,
        importanceBoost: row.importanceBoost,
        score: row.score,
      }));
    }),
});

export type MemoryRouter = typeof memoryRouter;
