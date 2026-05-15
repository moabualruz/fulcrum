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
  await db.query(
    `INSERT INTO projects (id, org_id, slug, name) VALUES ($1, $2, $3, $4)`,
    [id, orgId, slug, name ?? slug],
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
      input.kind ?? "file",
      input.title,
      input.bodyPath ?? input.title,
      input.sha256 ?? null,
      input.size ?? null,
      input.bodyPath ?? input.title,
      input.title,
      input.mime ?? "application/octet-stream",
      input.size ?? null,
      input.sha256 ?? null,
      input.archived ?? false,
    ],
  );
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
  for (const kind of input.kinds) {
    const sourceId = `${kind}-e2e-${crypto.randomUUID()}`;
    await indexSearchDocumentOrm(em, {
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

export async function cleanupE2eFixtures(
  db: ProductDb,
  input: E2eCleanupInput,
): Promise<void> {
  await deleteByIds(db, "artifacts", input.artifactIds);
  await deleteByIds(db, "documents", input.docIds);
  await deleteByIds(db, "tasks", input.taskIds);
  await deleteSearchDocuments(db, input.searchSourceIds);

  for (const id of input.projectIds ?? []) {
    await db.query("DELETE FROM events WHERE project_id = $1", [id]);
    await db.query("DELETE FROM projects WHERE id = $1", [id]);
  }
  await deleteByIds(db, "agent_runs", input.runIds);
}

async function deleteSearchDocuments(
  db: ProductDb,
  ids: readonly string[] | undefined,
): Promise<void> {
  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    ["search_documents"],
  );
  const columnNames = new Set(columns.map((row) => row.column_name));
  const idColumn = columnNames.has("source_id") ? "source_id" : "entity_id";
  await deleteByIds(db, "search_documents", ids, idColumn);
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
