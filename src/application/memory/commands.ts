import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { Memory } from "../../db/entities/memory/Memory.ts";
import { AppForbiddenError } from "../errors.ts";
import { findMemoryOrThrow, serializeMemory } from "./queries.ts";
import type {
  CreateMemoryInput,
  MemoryApplicationContext,
  MemoryDto,
  UpdateMemoryInput,
} from "./types.ts";

export async function createMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  input: CreateMemoryInput,
): Promise<MemoryDto> {
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
  em.persist(memory);
  await em.flush();
  return serializeMemory(memory);
}

export async function deleteMemory(
  em: EntityManager,
  ctx: MemoryApplicationContext,
  id: string,
): Promise<{ deleted: true }> {
  const memory = await findMemoryOrThrow(em, ctx.orgId, id);
  em.remove(memory);
  await em.flush();
  return { deleted: true };
}
