import type { EntityManager } from "@mikro-orm/postgresql";

import { Memory } from "../../db/entities/memory/Memory.ts";
import { rankMemoryMatches } from "../../memory/retrieval/scoring.ts";
import { AppNotFoundError } from "../errors.ts";
import type {
  ListMemoriesInput,
  MemoryApplicationContext,
  MemoryDto,
  RankedMemoryDto,
  SearchMemoryInput,
} from "./types.ts";

export function memoryApplicationScope(ctx: MemoryApplicationContext): MemoryApplicationContext {
  return ctx;
}

export async function getMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  id: string,
): Promise<MemoryDto> {
  return serializeMemory(await findMemoryOrThrow(em, ctx.orgId, id));
}

export async function listMemories(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: ListMemoriesInput = {},
): Promise<MemoryDto[]> {
  const memories = await em.find(Memory, listWhere(ctx.orgId, input), {
    orderBy: { createdAt: "DESC", id: "ASC" },
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  } as never);
  return filterTags(memories, input.tags).map(serializeMemory);
}

export async function searchMemories(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: SearchMemoryInput,
): Promise<RankedMemoryDto[]> {
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
}

export async function findMemoryOrThrow(
  em: EntityManager,
  orgId: string,
  id: string,
): Promise<Memory> {
  const memory = await em.findOne(Memory, { org: orgId, id } as never);
  if (!memory) throw new AppNotFoundError("Memory not found.");
  return memory;
}

export function serializeMemory(memory: Memory): MemoryDto {
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

function listWhere(orgId: string, input: ListMemoriesInput | SearchMemoryInput = {}) {
  return {
    org: orgId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.global !== undefined ? { global: input.global } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.importance ? { importance: input.importance } : {}),
    ...(input.archived !== undefined ? { archived: input.archived } : { archived: false }),
    ...(input.source ? { source: input.source } : {}),
  };
}

function filterTags<TMemory extends Memory>(
  memories: TMemory[],
  tags: readonly string[] | undefined,
): TMemory[] {
  if (!tags?.length) return memories;
  return memories.filter((memory) => tags.every((tag) => memory.tags.includes(tag)));
}
