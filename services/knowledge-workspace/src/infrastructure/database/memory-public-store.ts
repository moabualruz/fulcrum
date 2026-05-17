import { randomUUID } from "node:crypto";
import { DataSource, In, MoreThanOrEqual, type FindOptionsWhere } from "typeorm";

import {
  type FulcrumMemory,
  FulcrumMemoryEntity,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";

export interface MemoryPublicRow {
  id: string;
  projectId: string | null;
  global: boolean;
  kind: string;
  body: string;
  tags: string[];
  importance: string;
  source: string;
  sourceRef: Record<string, unknown>;
  traceId: string;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export class MemoryPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    projectId?: string;
    global?: boolean;
    kind?: string;
    tags?: string[];
    importance?: string;
    archived?: boolean;
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<MemoryPublicRow[]> {
    const where: FindOptionsWhere<FulcrumMemory> = {};
    if (input.projectId) where.projectId = input.projectId;
    if (input.global !== undefined) where.scope = input.global ? "global" : In(["project", "workspace"]);
    if (input.kind) where.kind = input.kind;
    if (input.importance) where.importance = input.importance;
    if (input.archived !== undefined) where.archived = input.archived;
    if (input.source) where.source = input.source;

    const memories = await this.repository().find({
      where,
      order: { createdAt: "DESC", id: "ASC" },
      take: input.limit ?? 50,
      skip: input.offset ?? 0,
    });
    const tags = input.tags ?? [];
    return memories.filter((memory) => tags.every((tag) => memory.tags.includes(tag))).map(toPublicRow);
  }

  async create(input: {
    projectId?: string | null;
    global?: boolean;
    kind?: string;
    body: string;
    tags?: string[];
    importance?: string;
    source?: "manual";
    sourceRef?: Record<string, unknown>;
  }): Promise<MemoryPublicRow> {
    const id = randomUUID();
    const memory = await this.repository().save({
      id,
      projectId: input.projectId ?? null,
      traceId: `trace-memory-${id}`,
      scope: input.global ? "global" : input.projectId ? "project" : "workspace",
      kind: input.kind ?? "note",
      body: input.body,
      tags: input.tags ?? [],
      importance: input.importance ?? "medium",
      source: input.source ?? "manual",
      sourceRef: input.sourceRef ?? {},
      archived: false,
    });
    return toPublicRow(memory);
  }

  async search(input: Parameters<MemoryPublicStore["list"]>[0] & {
    query: string;
  }): Promise<MemoryPublicRow[]> {
    const query = input.query.trim().toLowerCase();
    if (!query) return [];
    const rows = await this.list(input);
    return rows.filter((row) =>
      row.body.toLowerCase().includes(query) ||
      row.kind.toLowerCase().includes(query) ||
      row.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  async listDigestWindow(input: {
    projectId: string;
    since: Date;
    limit?: number;
  }): Promise<MemoryPublicRow[]> {
    const memories = await this.repository().find({
      where: {
        projectId: input.projectId,
        archived: false,
        createdAt: MoreThanOrEqual(input.since),
      },
      order: { createdAt: "ASC", id: "ASC" },
      take: input.limit ?? 500,
    });
    return memories.map(toPublicRow);
  }

  async get(input: { id: string }): Promise<MemoryPublicRow | null> {
    const memory = await this.repository().findOneBy({ id: input.id });
    return memory ? toPublicRow(memory) : null;
  }

  async update(input: {
    id: string;
    body?: string;
    tags?: string[];
    importance?: string;
  }): Promise<MemoryPublicRow | null> {
    const memory = await this.repository().findOneBy({ id: input.id });
    if (!memory) return null;

    if (input.body !== undefined) memory.body = input.body;
    if (input.tags !== undefined) memory.tags = input.tags;
    if (input.importance !== undefined) memory.importance = input.importance;
    return toPublicRow(await this.repository().save(memory));
  }

  async delete(input: { id: string }): Promise<{ deleted: true; id: string } | null> {
    const memory = await this.repository().findOneBy({ id: input.id });
    if (!memory) return null;

    await this.repository().remove(memory);
    return { deleted: true, id: input.id };
  }

  async promote(input: { id: string }): Promise<MemoryPublicRow | null> {
    const memory = await this.repository().findOneBy({ id: input.id });
    if (!memory) return null;

    memory.scope = "global";
    memory.archived = false;
    return toPublicRow(await this.repository().save(memory));
  }

  async archive(input: { id: string }): Promise<MemoryPublicRow | null> {
    return await this.setArchived(input.id, true);
  }

  async restore(input: { id: string }): Promise<MemoryPublicRow | null> {
    return await this.setArchived(input.id, false);
  }

  private async setArchived(id: string, archived: boolean): Promise<MemoryPublicRow | null> {
    const memory = await this.repository().findOneBy({ id });
    if (!memory) return null;

    memory.archived = archived;
    return toPublicRow(await this.repository().save(memory));
  }

  private repository() {
    return this.dataSource.getRepository(FulcrumMemoryEntity);
  }
}

function toPublicRow(memory: FulcrumMemory): MemoryPublicRow {
  return {
    id: memory.id,
    projectId: memory.projectId,
    global: memory.scope === "global",
    kind: memory.kind,
    body: memory.body,
    tags: memory.tags,
    importance: memory.importance,
    source: memory.source,
    sourceRef: memory.sourceRef,
    traceId: memory.traceId,
    archived: memory.archived,
    createdAt: memory.createdAt?.toISOString() ?? null,
    updatedAt: memory.updatedAt?.toISOString() ?? null,
  };
}
