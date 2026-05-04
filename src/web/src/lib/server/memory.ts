import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";
import { appendEvent } from "@fulcrum/product-kernel/store/repositories.ts";
import { indexSearchDocument } from "@fulcrum/product-kernel/search.ts";

export type MemoryScope = "project" | "global" | "task" | "user";

export const MEMORY_SCOPES: readonly MemoryScope[] = [
  "project", "global", "task", "user",
] as const;

export interface CreateMemoryInput {
  orgId: string;
  projectId: string | null;
  scope: MemoryScope;
  kind: string;
  key: string;
  body: string;
  source?: string | null;
}

export interface UpdateMemoryInput {
  id: string;
  orgId: string;
  scope?: MemoryScope;
  body?: string;
  key?: string;
  kind?: string;
  source?: string | null;
}

export interface MemoryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  scope: string;
  kind: string;
  key: string;
  body: string;
  source: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ListMemoriesInput {
  orgId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  kind?: string;
  limit?: number;
  offset?: number;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeRow(row: MemoryRow) {
  return {
    ...row,
    created_at: isoStamp(row.created_at),
    updated_at: isoStamp(row.updated_at),
  };
}

export async function createMemoryAction(
  db: ProductDb,
  input: CreateMemoryInput,
): Promise<{ id: string }> {
  const id = newUlid();
  await db.query(
    `INSERT INTO memories (id, org_id, project_id, scope, kind, key, body, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, input.orgId, input.projectId, input.scope, input.kind, input.key, input.body, input.source ?? null],
  );
  const ctx = { orgId: input.orgId, projectId: input.projectId, subjectKind: "memory", subjectId: id } as const;
  await appendEvent(db, { ...ctx, actor: "system", verb: "created", payload: { key: input.key, scope: input.scope } });
  await indexSearchDocument(db, {
    orgId: input.orgId, projectId: input.projectId, sourceKind: "memory", sourceId: id,
    title: input.key, body: input.body, labels: [input.scope, input.kind],
  });
  return { id };
}

export async function updateMemoryAction(
  db: ProductDb,
  input: UpdateMemoryInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateMemoryAction: id required");
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
    changed.push(col);
  };
  if (input.scope !== undefined) push("scope", input.scope);
  if (input.body !== undefined) push("body", input.body);
  if (input.key !== undefined) push("key", input.key);
  if (input.kind !== undefined) push("kind", input.kind);
  if (input.source !== undefined) push("source", input.source ?? "");
  if (changed.length === 0) throw new Error("updateMemoryAction: no fields to update");
  sets.push(`updated_at = now()`);
  params.push(input.id);
  const idIdx = params.length;
  params.push(input.orgId);
  const orgIdx = params.length;
  const rows = await db.query<MemoryRow>(
    `UPDATE memories SET ${sets.join(", ")}
       WHERE id = $${idIdx} AND org_id = $${orgIdx}
     RETURNING id, org_id, project_id, scope, kind, key, body, source, created_at, updated_at`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error(`updateMemoryAction: memory not found: ${input.id}`);
  await appendEvent(db, {
    orgId: row.org_id, projectId: row.project_id, actor: "system",
    subjectKind: "memory", subjectId: input.id, verb: "updated", payload: { changed },
  });
  await indexSearchDocument(db, {
    orgId: row.org_id, projectId: row.project_id, sourceKind: "memory", sourceId: input.id,
    title: row.key, body: row.body, labels: [row.scope, row.kind],
  });
  return { ok: true };
}

export async function deleteMemoryAction(
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<{ ok: true }> {
  await db.query(
    `DELETE FROM search_documents WHERE source_kind = 'memory' AND source_id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const rows = await db.query<{ org_id: string; project_id: string | null }>(
    `DELETE FROM memories WHERE id = $1 AND org_id = $2 RETURNING org_id, project_id`,
    [id, orgId],
  );
  const row = rows[0];
  if (row) {
    await appendEvent(db, {
      orgId: row.org_id, projectId: row.project_id, actor: "system",
      subjectKind: "memory", subjectId: id, verb: "deleted",
    });
  }
  return { ok: true };
}

export async function getMemory(
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<ReturnType<typeof normalizeRow> | null> {
  const rows = await db.query<MemoryRow>(
    `SELECT id, org_id, project_id, scope, kind, key, body, source, created_at, updated_at
       FROM memories WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const row = rows[0];
  return row ? normalizeRow(row) : null;
}

export async function listMemories(
  db: ProductDb,
  input: ListMemoriesInput,
): Promise<ReturnType<typeof normalizeRow>[]> {
  const conditions: string[] = ["org_id = $1"];
  const params: (string | number | null)[] = [input.orgId];
  if (input.scope !== undefined) {
    params.push(input.scope);
    conditions.push(`scope = $${params.length}`);
  }
  if (input.projectId !== undefined && input.projectId !== null) {
    params.push(input.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (input.kind !== undefined) {
    params.push(input.kind);
    conditions.push(`kind = $${params.length}`);
  }
  const limit = input.limit ?? 100;
  const offset = input.offset ?? 0;
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;
  const rows = await db.query<MemoryRow>(
    `SELECT id, org_id, project_id, scope, kind, key, body, source, created_at, updated_at
       FROM memories
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC, id ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return rows.map(normalizeRow);
}
