import type { EntityManager } from "typeorm";

import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import type { MemoryKind, MemorySource } from "@knowledge-workspace/infrastructure/database/entities/memory/enums.ts";
import { rankMemoryMatches } from "@knowledge-workspace/application/memory/retrieval/scoring.ts";
import { createMemory } from "@knowledge-workspace/application/memory/commands.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  CreateMemoryInput,
  ListMemoriesInput,
  MemoryApplicationContext,
  MemoryDto,
  RankedMemoryDto,
  SearchMemoryInput,
} from "@knowledge-workspace/application/memory/types.ts";

export type MemoryScope = "project" | "global" | "task" | "user";

export interface WebMemoryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  body: string;
  source: MemorySource | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryActionInput {
  projectId: string | null;
  scope: MemoryScope;
  kind: string;
  key: string;
  body: string;
}

export const MEMORY_SCOPES: readonly MemoryScope[] = [
  "project", "global", "task", "user",
] as const;

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
  const memories = await em.find(Memory, {
    where: listWhere(ctx.orgId, input) as never,
    order: { createdAt: "DESC", id: "ASC" },
    take: input.limit ?? 50,
    skip: input.offset ?? 0,
  });
  return filterTags(memories, input.tags).map(serializeMemory);
}

export async function listMemoryRows(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: ListMemoriesInput & { scope?: MemoryScope } = {},
): Promise<WebMemoryRow[]> {
  const global = input.scope === "global" ? true : input.scope === "project" ? false : input.global;
  const projectId = input.scope === "global" ? null : input.projectId;
  const memories = await listMemories(em, ctx, {
    ...input,
    global,
    projectId,
    limit: input.limit ?? 100,
  });
  return memories.map(toWebMemoryRow);
}

export async function createMemoryAction(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: CreateMemoryActionInput,
): Promise<{ id: string }> {
  const memory = await createMemory(em, ctx, {
    projectId: input.scope === "global" ? null : input.projectId,
    global: input.scope === "global",
    kind: input.kind as CreateMemoryInput["kind"],
    body: input.body,
    sourceRef: { key: input.key, scope: input.scope },
  });
  return { id: memory.id };
}

export async function searchMemories(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: SearchMemoryInput,
): Promise<RankedMemoryDto[]> {
  const candidates = await em.find(Memory, {
    where: listWhere(ctx.orgId, input) as never,
    order: { createdAt: "DESC", id: "ASC" },
  });
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
  const memory = await em.findOne(Memory, { where: { org: { id: orgId }, id } } as never);
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

function toWebMemoryRow(memory: MemoryDto): WebMemoryRow {
  return {
    id: memory.id,
    org_id: memory.orgId,
    project_id: memory.projectId,
    scope: memory.global ? "global" : "project",
    kind: memory.kind,
    key: typeof memory.sourceRef["key"] === "string" ? memory.sourceRef["key"] : memory.id,
    body: memory.body,
    source: memory.source ?? null,
    created_at: memory.createdAt.toISOString(),
    updated_at: memory.updatedAt.toISOString(),
  };
}

function listWhere(orgId: string, input: ListMemoriesInput | SearchMemoryInput = {}) {
  return {
    org: { id: orgId },
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
