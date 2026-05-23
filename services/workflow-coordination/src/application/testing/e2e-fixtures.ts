import { indexSearchDocument } from "@platform-core/infrastructure/product-store/search.ts";
import type { ProductDb } from "@platform-core/infrastructure/product-store/db/types.ts";
import type { EntityManager } from "typeorm";
import { indexSearchDocumentOrm } from "@platform-core/application/orm-helpers.ts";

export interface E2eSeedTaskInput {
  projectId: string;
  title: string;
  status?: string;
  priority?: number;
}

export interface E2eSeedArtifactInput {
  projectId?: string | null;
  taskId?: string | null;
  title: string;
  kind?: string;
  mime?: string;
  size?: number;
  bodyPath?: string | null;
  sha256?: string | null;
  archived?: boolean;
}

export interface E2eSeedDocInput {
  projectId: string | null;
  title: string;
  body?: string;
  kind?: string;
}

export interface E2eCleanupInput {
  artifactIds?: readonly string[];
  docIds?: readonly string[];
  taskIds?: readonly string[];
  projectIds?: readonly string[];
  runIds?: readonly string[];
  searchSourceIds?: readonly string[];
}

export async function seedE2eProject(
  db: ProductDb,
  orgId: string,
  slug: string,
  name?: string,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const displayName = name ?? slug;
  await db.query(
    `INSERT INTO projects (id, org_id, slug, name) VALUES ($1, $2, $3, $4)`,
    [id, orgId, slug, displayName],
  );
  await db.query(
    `INSERT INTO fulcrum_workspaces (id, slug, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgId, orgId],
  );
  await db.query(
    `INSERT INTO fulcrum_projects (id, workspace_id, slug, name, trace_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, orgId, slug, displayName, `trace-e2e-${id}`],
  );
  return { id };
}

export async function seedE2eTask(
  db: ProductDb,
  orgId: string,
  input: E2eSeedTaskInput,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, orgId, input.projectId, input.title, input.status ?? "todo", input.priority ?? 0],
  );
  return { id };
}

export async function seedE2eDoc(
  db: ProductDb,
  orgId: string,
  input: E2eSeedDocInput,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, doc_type, title, body_md)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, orgId, input.projectId, input.kind ?? "note", input.title, input.body ?? ""],
  );
  return { id };
}

export async function seedE2eArtifact(
  db: ProductDb,
  orgId: string,
  input: E2eSeedArtifactInput,
): Promise<{ id: string; runId: string }> {
  const id = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const traceId = `trace-e2e-${id}`;
  const kind = input.kind ?? "file";
  const title = input.title;
  const bodyPath = input.bodyPath ?? input.title;
  const sha256 = input.sha256 ?? null;
  const size = input.size ?? null;
  const mime = input.mime ?? "application/octet-stream";
  const archived = input.archived ?? false;
  await db.query(
    `INSERT INTO agent_runs (id, org_id, agent_name, status) VALUES ($1, $2, $3, $4)`,
    [runId, orgId, "e2e-fixture", "succeeded"],
  );
  await db.query(
    `INSERT INTO artifacts (
       id, org_id, project_id, run_id, task_id, kind, title, body_path, sha256, size,
       path, filename, mime, size_bytes, checksum_sha256, archived
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      orgId,
      input.projectId ?? null,
      runId,
      input.taskId ?? null,
      kind,
      title,
      bodyPath,
      sha256,
      size,
      bodyPath,
      title,
      mime,
      size,
      sha256,
      archived,
    ],
  );
  if (input.projectId) {
    await db.query(
      `INSERT INTO fulcrum_artifacts (
         id, project_id, trace_id, run_id, task_id, doc_id, kind, title, filename,
         body_path, checksum_sha256, mime, size_bytes, lifecycle_state, metadata_json,
         archived, archived_at, deleted_at
       )
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        input.projectId,
        traceId,
        runId,
        input.taskId ?? null,
        kind,
        title,
        title,
        bodyPath,
        sha256,
        mime,
        size ?? 0,
        archived ? "archived" : "created",
        JSON.stringify({ lifecycleState: archived ? "archived" : "created" }),
        archived,
        archived ? new Date().toISOString() : null,
      ],
    );
  }
  return { id, runId };
}

export async function seedE2eSearchKinds(
  db: ProductDb,
  orgId: string,
  input: { common: string; kinds: readonly string[] },
): Promise<{ sourceIds: string[] }> {
  const sourceIds: string[] = [];
  for (const kind of input.kinds) {
    const sourceId = `${kind}-e2e-${crypto.randomUUID()}`;
    await indexSearchDocument(db, {
      orgId,
      sourceKind: kind,
      sourceId,
      title: `${input.common} ${kind} title`,
      body: `${input.common} ${kind} body`,
    });
    sourceIds.push(sourceId);
  }
  return { sourceIds };
}

export async function seedE2eSearchKindsOrm(
  em: EntityManager,
  orgId: string,
  input: { common: string; kinds: readonly string[] },
): Promise<{ sourceIds: string[] }> {
  const sourceIds: string[] = [];
  const projectId = crypto.randomUUID();
  const projectSlug = `search-e2e-${projectId}`;
  await em.query(
    `INSERT INTO fulcrum_workspaces (id, slug, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgId, orgId],
  );
  await em.query(
    `INSERT INTO fulcrum_projects (id, workspace_id, slug, name, trace_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [projectId, orgId, projectSlug, "Search E2E", `trace-e2e-${projectId}`],
  );
  for (const kind of input.kinds) {
    const sourceId = `${kind}-e2e-${crypto.randomUUID()}`;
    const documentId = `doc-${sourceId}`;
    const title = `${input.common} ${kind} title`;
    const body = `${input.common} ${kind} body`;
    const traceId = `trace-e2e-${sourceId}`;
    await indexSearchDocumentOrm(em, {
      orgId,
      sourceKind: kind,
      sourceId,
      title,
      body,
    });
    await em.query(
      `INSERT INTO fulcrum_documents (id, project_id, parent_id, title, body_md, source_type, trace_id)
       VALUES ($1, $2, NULL, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [documentId, projectId, title, body, kind, traceId],
    );
    await em.query(
      `INSERT INTO fulcrum_doc_pages (
         id, project_id, document_id, parent_page_id, title, slug, icon, position,
         body_md, editor_json, yjs_state, trace_id
       )
       VALUES ($1, $2, $3, NULL, $4, $5, NULL, $6, $7, '{}'::jsonb, NULL, $8)
       ON CONFLICT (id) DO NOTHING`,
      [sourceId, projectId, documentId, title, sourceId, sourceId, body, traceId],
    );
    await em.query(
      `INSERT INTO fulcrum_doc_search_entries (
         id, page_id, project_id, source_kind, title, search_text, excerpt, trace_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (page_id) DO UPDATE SET
         source_kind = EXCLUDED.source_kind,
         title = EXCLUDED.title,
         search_text = EXCLUDED.search_text,
         excerpt = EXCLUDED.excerpt,
         updated_at = now()`,
      [`entry-${sourceId}`, sourceId, projectId, kind, title, body, body, traceId],
    );
    sourceIds.push(sourceId);
  }
  return { sourceIds };
}

export async function cleanupE2eFixtures(
  db: ProductDb,
  input: E2eCleanupInput,
): Promise<void> {
  await deleteByIds(db, "fulcrum_artifacts", input.artifactIds);
  await deleteByIds(db, "artifacts", input.artifactIds);
  await deleteByIds(db, "documents", input.docIds);
  await deleteByIds(db, "tasks", input.taskIds);
  await deleteSearchDocuments(db, input.searchSourceIds);

  for (const id of input.projectIds ?? []) {
    await db.query("DELETE FROM events WHERE project_id = $1", [id]);
    await db.query("DELETE FROM fulcrum_projects WHERE id = $1", [id]);
    await db.query("DELETE FROM projects WHERE id = $1", [id]);
  }
  await deleteByIds(db, "agent_runs", input.runIds);
}

async function deleteSearchDocuments(
  db: ProductDb,
  ids: readonly string[] | undefined,
): Promise<void> {
  const projectIds = new Set<string>();
  for (const id of ids ?? []) {
    const rows = await db.query<{ project_id: string }>(
      `SELECT DISTINCT project_id FROM fulcrum_doc_search_entries WHERE page_id = $1`,
      [id],
    );
    for (const row of rows) projectIds.add(row.project_id);
  }
  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    ["search_documents"],
  );
  const columnNames = new Set(columns.map((row) => row.column_name));
  const idColumn = columnNames.has("source_id") ? "source_id" : "entity_id";
  await deleteByIds(db, "search_documents", ids, idColumn);
  await deleteByIds(db, "fulcrum_doc_search_entries", ids, "page_id");
  await deleteByIds(db, "fulcrum_doc_pages", ids);
  await deleteByIds(db, "fulcrum_documents", (ids ?? []).map((id) => `doc-${id}`));
  await deleteByIds(db, "fulcrum_projects", [...projectIds]);
}

async function deleteByIds(
  db: ProductDb,
  table: string,
  ids: readonly string[] | undefined,
  column = "id",
): Promise<void> {
  for (const id of ids ?? []) {
    await db.query(`DELETE FROM ${table} WHERE ${column} = $1`, [id]);
  }
}
