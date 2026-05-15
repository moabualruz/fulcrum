import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { AppForbiddenError } from "@platform-core/domain/errors.ts";
import { findMemoryOrThrow, serializeMemory } from "@knowledge-workspace/application/memory/queries.ts";
import type {
  CreateMemoryInput,
  MemoryApplicationContext,
  MemoryDto,
  UpdateMemoryInput,
} from "@knowledge-workspace/application/memory/types.ts";

export async function createMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: CreateMemoryInput,
): Promise<MemoryDto> {
  const now = new Date();
  const memory = em.create(Memory, {
    org: { id: ctx.orgId } as Org,
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
  await em.save(memory);
  return serializeMemory(memory);
}

export async function updateMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: UpdateMemoryInput,
): Promise<MemoryDto> {
  const memory = await findMemoryOrThrow(em, ctx.orgId, input.id);
  if (memory.source !== "manual" && input.forceEdit !== true) {
    throw new AppForbiddenError("Non-manual memories require explicit forceEdit confirmation.");
  }

  if (input.body !== undefined) memory.body = input.body;
  if (input.tags !== undefined) memory.tags = input.tags;
  if (input.importance !== undefined) memory.importance = input.importance;
  memory.updatedAt = new Date();
  await em.save(memory);
  return serializeMemory(memory);
}

export async function promoteMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  id: string,
): Promise<MemoryDto> {
  const memory = await findMemoryOrThrow(em, ctx.orgId, id);
  const promotedFromProjectId = memory.projectId;
  memory.projectId = null;
  memory.global = true;
  memory.importance = "high";
  memory.tags = Array.from(new Set([...memory.tags, "accepted"]));
  memory.sourceRef = {
    ...memory.sourceRef,
    ...(promotedFromProjectId ? { promotedFromProjectId } : {}),
  };
  memory.updatedAt = new Date();
  await em.save(memory);
  return serializeMemory(memory);
}

export async function deleteMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  id: string,
): Promise<{ deleted: true }> {
  const memory = await findMemoryOrThrow(em, ctx.orgId, id);
  em.remove(memory);
  return { deleted: true };
}
