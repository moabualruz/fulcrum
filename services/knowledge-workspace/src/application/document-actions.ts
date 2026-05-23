import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { newUlid } from "@platform-core/application/platform-primitives/monotonic-id.ts";

type DocumentDb = EntityManager | SqlExecutor;

export interface CreateDocumentInput {
  orgId: string;
  projectId: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
  sourcePath?: string | null;
}

export interface UpdateDocumentInput {
  id: string;
  orgId: string;
  title?: string;
  body?: string;
  kind?: string;
  frontmatter?: Record<string, unknown>;
}

interface DocRow {
  org_id: string;
  project_id: string | null;
  kind?: string;
  doc_type?: string;
  title: string;
  body?: string;
  body_md?: string;
  frontmatter: Record<string, unknown>;
}

function isSqlExecutor(db: DocumentDb): db is SqlExecutor {
  // A TypeORM EntityManager also exposes `.query`, so `query` alone is not a
  // safe discriminator — it would misclassify an EntityManager as a raw SQL
  // store and pick the wrong id generator (ULID vs UUID). The raw SqlExecutor
  // is the one with `.exec` and without the EntityManager's `.getRepository`.
  return (
    "query" in db &&
    typeof (db as { query: unknown }).query === "function" &&
    typeof (db as { exec?: unknown }).exec === "function" &&
    !("getRepository" in db)
  );
}

function sqlForManager(sql: string, params: readonly unknown[]): { sql: string; params: unknown[] } {
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

async function queryRows<T>(
  db: DocumentDb,
  sql: string,
  params: readonly unknown[] = [],): Promise<T[]> {
  if (isSqlExecutor(db)) {
    return db.query<T>(sql, params as never);
  }
  const normalized = sqlForManager(sql, params);
  return db.query(normalized.sql, normalized.params) as Promise<T[]>;
}

async function tableColumns(db: DocumentDb, tableName: string): Promise<Set<string>> {
  const rows = await queryRows<{ column_name: string }>(
    db,
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],);
  return new Set(rows.map((row) => row.column_name));
}

function arrayLiteral(values: string[]): string {
  if (values.length === 0) return "{}";
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

function extractLabels(fm: Record<string, unknown> | null | undefined): string[] {
  const raw = fm && (fm as { labels?: unknown }).labels;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}


export async function createDocumentAction(
  db: DocumentDb,
  input: CreateDocumentInput,): Promise<{ id: string }> {
  const id = randomUUID();
  const fm = input.frontmatter ?? {};
  const columns = await tableColumns(db, "documents");
  const insert: Record<string, unknown> = {
    id,
    org_id: input.orgId,
    project_id: input.projectId,
    title: input.title,
    frontmatter: JSON.stringify(fm),
  };
  if (columns.has("kind")) insert["kind"] = input.kind;
  if (columns.has("doc_type")) insert["doc_type"] = input.kind;
  if (columns.has("body")) insert["body"] = input.body;
  if (columns.has("body_md")) insert["body_md"] = input.body;
  if (columns.has("source_path")) insert["source_path"] = input.sourcePath ?? null;
  const names = Object.keys(insert);
  const placeholders = names.map((name, index) => `$${index + 1}${name === "frontmatter" ? "::jsonb" : ""}`);
  await queryRows(
    db,
    `INSERT INTO documents (${names.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    Object.values(insert),);
  const ctx = { orgId: input.orgId, projectId: input.projectId, subjectKind: "document", subjectId: id } as const;
  await appendDocumentEvent(db, {...ctx, actor: "system", verb: "created", payload: { title: input.title, kind: input.kind } });
  await indexDocumentSearch(db, {
    orgId: input.orgId, projectId: input.projectId, sourceKind: "document", sourceId: id,
    title: input.title, body: input.body, labels: extractLabels(fm),
  });
  return { id };
}

export async function updateDocumentAction(
  db: DocumentDb,
  input: UpdateDocumentInput,): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateDocumentAction: id is required");
  const changed: string[] = [];
  if (input.title !== undefined) changed.push("title");
  if (input.body !== undefined) changed.push("body");
  if (input.kind !== undefined) changed.push("kind");
  if (input.frontmatter !== undefined) changed.push("frontmatter");
  if (changed.length === 0) throw new Error("updateDocumentAction: no fields to update");
  const setClauses: string[] = [];
  const params: unknown[] = [];
  const columns = await tableColumns(db, "documents");
  const addParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (input.title !== undefined) setClauses.push(`title = ${addParam(input.title)}`);
  if (input.body !== undefined) {
    const bodyParam = addParam(input.body);
    if (columns.has("body")) setClauses.push(`body = ${bodyParam}`);
    if (columns.has("body_md")) setClauses.push(`body_md = ${bodyParam}`);
  }
  if (input.kind !== undefined) {
    const kindParam = addParam(input.kind);
    if (columns.has("kind")) setClauses.push(`kind = ${kindParam}`);
    if (columns.has("doc_type")) setClauses.push(`doc_type = ${kindParam}`);
  }
  if (input.frontmatter !== undefined) setClauses.push(`frontmatter = ${addParam(JSON.stringify(input.frontmatter))}::jsonb`);
  setClauses.push("updated_at = now()");
  params.push(input.id, input.orgId);
  const rows = await queryRows<DocRow>(
    db,
    `UPDATE documents
        SET ${setClauses.join(", ")}
      WHERE id = $${params.length - 1} AND org_id = $${params.length}
      RETURNING *`,
    params,);
  const row = rows[0];
  if (!row) throw new Error(`updateDocumentAction: document not found: ${input.id}`);
  await appendDocumentEvent(db, {
    orgId: row.org_id, projectId: row.project_id, actor: "system",
    subjectKind: "document", subjectId: input.id, verb: "updated", payload: { changed },
  });
  await indexDocumentSearch(db, {
    orgId: row.org_id, projectId: row.project_id, sourceKind: "document", sourceId: input.id,
    title: row.title, body: row.body ?? row.body_md ?? "", labels: extractLabels(row.frontmatter),
  });
  return { ok: true };
}

export async function deleteDocumentAction(db: DocumentDb, id: string, orgId: string): Promise<{ ok: true }> {
  const searchColumns = await tableColumns(db, "search_documents");
  const searchDeleteFilters: string[] = [];
  if (searchColumns.has("source_kind") && searchColumns.has("source_id")) {
    searchDeleteFilters.push("(source_kind = 'document' AND source_id = $2)");
  }
  if (searchColumns.has("entity_kind") && searchColumns.has("entity_id")) {
    searchDeleteFilters.push("(entity_kind = 'document' AND entity_id = $2)");
  }
  if (searchDeleteFilters.length > 0) {
    await queryRows(
      db,
      `DELETE FROM search_documents
        WHERE org_id = $1 AND (${searchDeleteFilters.join(" OR ")})`,
      [orgId, id],);
  }
  const rows = await queryRows<{ org_id: string; project_id: string | null }>(
    db,
    `DELETE FROM documents
      WHERE id = $1 AND org_id = $2
      RETURNING org_id, project_id`,
    [id, orgId],);
  const row = rows[0];
  if (row) {
    await appendDocumentEvent(db, {
      orgId: row.org_id, projectId: row.project_id, actor: "system",
      subjectKind: "document", subjectId: id, verb: "deleted",
    });
  }
  return { ok: true };
}

async function appendDocumentEvent(db: DocumentDb, input: {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const id = isSqlExecutor(db)  ? newUlid() : randomUUID();
  await queryRows(
    db,
    `INSERT INTO events
       (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [id, input.orgId, input.projectId ?? null, input.actor, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],);
}

async function indexDocumentSearch(db: DocumentDb, input: {
  orgId: string;
  projectId?: string | null;
  sourceKind: string;
  sourceId: string;
  title: string;
  body: string;
  labels?: string[];
}): Promise<void> {
  const columns = await tableColumns(db, "search_documents");
  const kindColumn = columns.has("source_kind") ? "source_kind" : "entity_kind";
  const idColumn = columns.has("source_id") ? "source_id" : "entity_id";
  const existing = await queryRows<{ id: string }>(
    db,
    `SELECT id
       FROM search_documents
      WHERE org_id = $1 AND ${kindColumn} = $2 AND ${idColumn} = $3`,
    [input.orgId, input.sourceKind, input.sourceId],);
  const values: Record<string, unknown> = {
    title: input.title,
    body: input.body,
    project_id: input.projectId ?? null,
  };
  if (columns.has("labels")) values["labels"] = arrayLiteral(input.labels ?? []);
  const setClauses = Object.keys(values).map((key, index) => {
    const cast = key === "labels" ? "::text[]" : "";
    return `${key} = $${index + 2}${cast}`;
  });
  if (existing[0]) {
    await queryRows(
      db,
      `UPDATE search_documents
          SET ${setClauses.join(", ")}
        WHERE id = $1`,
      [existing[0].id,...Object.values(values)],);
    return;
  }
  const insert: Record<string, unknown> = {
    id: isSqlExecutor(db)  ? newUlid() : randomUUID(),
    org_id: input.orgId,
    project_id: input.projectId ?? null,
    [kindColumn]: input.sourceKind,
    [idColumn]: input.sourceId,
    title: input.title,
    body: input.body,
  };
  if (columns.has("entity_kind")) insert["entity_kind"] = input.sourceKind;
  if (columns.has("entity_id")) insert["entity_id"] = input.sourceId;
  if (columns.has("source_kind")) insert["source_kind"] = input.sourceKind;
  if (columns.has("source_id")) insert["source_id"] = input.sourceId;
  if (columns.has("labels")) insert["labels"] = arrayLiteral(input.labels ?? []);
  const names = Object.keys(insert);
  const placeholders = names.map((name, index) => `$${index + 1}${name === "labels" ? "::text[]" : ""}`);
  await queryRows(
    db,
    `INSERT INTO search_documents (${names.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    Object.values(insert),);
}
