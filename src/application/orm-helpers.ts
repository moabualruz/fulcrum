/**
 * ORM helper functions replacing kernel compatibility helpers through Kysely.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

export function ormSqlConnection(manager: EntityManager) {
  const conn = manager.getConnection();
  return {
    execute<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T> {
      const normalized = normalizeSqlParams(sql, params);
      return conn.execute(normalized.sql, normalized.params) as Promise<T>;
    },
  };
}

export function normalizeSqlParams(
  sql: string,
  params: readonly unknown[] = [],
): { sql: string; params: unknown[] } {
  const normalizedParams: unknown[] = [];
  const normalizedSql = sql.replace(/\$(\d+)/g, (_match, index: string) => {
    normalizedParams.push(params[Number(index) - 1]);
    return "?";
  });
  return {
    sql: normalizedSql,
    params: normalizedParams.length > 0 ? normalizedParams : [...params],
  };
}

export interface AppendEventInput {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}

export async function appendEventOrm(
  em: EntityManager,
  input: AppendEventInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getKysely<any>()
    .insertInto("events")
    .values({
      id,
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      actor: input.actor,
      subject_kind: input.subjectKind,
      subject_id: input.subjectId,
      verb: input.verb,
      payload: { actor: input.actor, ...(input.payload ?? {}) },
    })
    .execute();
  return { id };
}

export interface IndexSearchInput {
  orgId: string;
  projectId?: string | null;
  sourceKind: string;
  sourceId: string;
  title: string;
  body: string;
  labels?: string[];
}

export async function indexSearchDocumentOrm(
  em: EntityManager,
  input: IndexSearchInput,
): Promise<void> {
  const id = randomUUID();
  const db = em.getKysely<any>();
  const columns = await tableColumns(em, "search_documents");
  const kindColumn = columns.has("source_kind") ? "source_kind" : "entity_kind";
  const idColumn = columns.has("source_id") ? "source_id" : "entity_id";
  const existing = await db
    .selectFrom("search_documents")
    .select(["id"])
    .where("org_id", "=", input.orgId)
    .where(kindColumn, "=", input.sourceKind)
    .where(idColumn, "=", input.sourceId)
    .executeTakeFirst();
  const values = {
    title: input.title,
    body: input.body,
    labels: input.labels ?? [],
    updated_at: new Date(),
    project_id: input.projectId ?? null,
  } as Record<string, unknown>;
  if (!columns.has("labels")) delete values["labels"];
  if (!columns.has("updated_at")) delete values["updated_at"];
  if (!columns.has("project_id")) delete values["project_id"];
  if (existing) {
    await db.updateTable("search_documents").set(values).where("id", "=", existing.id).execute();
    return;
  }
  const insert = {
    id,
    org_id: input.orgId,
    [kindColumn]: input.sourceKind,
    [idColumn]: input.sourceId,
    ...values,
  } as Record<string, unknown>;
  if (columns.has("entity_kind")) insert["entity_kind"] = input.sourceKind;
  if (columns.has("entity_id")) insert["entity_id"] = input.sourceId;
  if (columns.has("source_kind")) insert["source_kind"] = input.sourceKind;
  if (columns.has("source_id")) insert["source_id"] = input.sourceId;
  await db.insertInto("search_documents").values(insert).execute();
}

async function tableColumns(em: EntityManager, tableName: string): Promise<Set<string>> {
  const rows = await em.getKysely<any>()
    .selectFrom("information_schema.columns")
    .select(["column_name"])
    .where("table_schema", "=", "public")
    .where("table_name", "=", tableName)
    .execute() as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}

export interface EnqueueJobInput {
  orgId: string;
  projectId?: string | null;
  queue: string;
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export async function enqueueJobOrm(
  em: EntityManager,
  input: EnqueueJobInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await em.getKysely<any>()
    .insertInto("jobs")
    .values({
      id,
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      queue: input.queue,
      kind: input.kind,
      payload: input.payload ?? {},
      status: "queued",
      max_attempts: input.maxAttempts ?? 3,
      available_at: input.availableAt ?? new Date(),
    })
    .execute();
  return { id };
}
