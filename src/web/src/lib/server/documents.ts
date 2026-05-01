import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import { appendEvent } from "../../../../product-kernel/store/repositories.ts";
import { indexSearchDocument } from "../../../../product-kernel/search.ts";

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
  title?: string;
  body?: string;
  kind?: string;
  frontmatter?: Record<string, unknown>;
}

interface DocRow {
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

function extractLabels(fm: Record<string, unknown> | null | undefined): string[] {
  const raw = fm && (fm as { labels?: unknown }).labels;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

export async function createDocumentAction(
  db: ProductDb,
  input: CreateDocumentInput,
): Promise<{ id: string }> {
  const id = newUlid();
  const fm = input.frontmatter ?? {};
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body, frontmatter, source_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [id, input.orgId, input.projectId, input.kind, input.title, input.body, JSON.stringify(fm), input.sourcePath ?? null],
  );
  const ctx = { orgId: input.orgId, projectId: input.projectId, subjectKind: "document", subjectId: id } as const;
  await appendEvent(db, { ...ctx, actor: "system", verb: "created", payload: { title: input.title, kind: input.kind } });
  await indexSearchDocument(db, {
    orgId: input.orgId, projectId: input.projectId, sourceKind: "document", sourceId: id,
    title: input.title, body: input.body, labels: extractLabels(fm),
  });
  return { id };
}

export async function updateDocumentAction(
  db: ProductDb,
  input: UpdateDocumentInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateDocumentAction: id is required");
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string, cast = "") => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
    changed.push(col);
  };
  if (input.title !== undefined) push("title", input.title);
  if (input.body !== undefined) push("body", input.body);
  if (input.kind !== undefined) push("kind", input.kind);
  if (input.frontmatter !== undefined) push("frontmatter", JSON.stringify(input.frontmatter), "::jsonb");
  if (changed.length === 0) throw new Error("updateDocumentAction: no fields to update");
  sets.push(`updated_at = now()`);
  params.push(input.id);
  const rows = await db.query<DocRow>(
    `UPDATE documents SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id, kind, title, body, frontmatter`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error(`updateDocumentAction: document not found: ${input.id}`);
  await appendEvent(db, {
    orgId: row.org_id, projectId: row.project_id, actor: "system",
    subjectKind: "document", subjectId: input.id, verb: "updated", payload: { changed },
  });
  await indexSearchDocument(db, {
    orgId: row.org_id, projectId: row.project_id, sourceKind: "document", sourceId: input.id,
    title: row.title, body: row.body, labels: extractLabels(row.frontmatter),
  });
  return { ok: true };
}

export async function deleteDocumentAction(db: ProductDb, id: string): Promise<{ ok: true }> {
  await db.query(`DELETE FROM search_documents WHERE source_kind = 'document' AND source_id = $1`, [id]);
  const rows = await db.query<{ org_id: string; project_id: string | null }>(
    `DELETE FROM documents WHERE id = $1 RETURNING org_id, project_id`,
    [id],
  );
  const row = rows[0];
  if (row) {
    await appendEvent(db, {
      orgId: row.org_id, projectId: row.project_id, actor: "system",
      subjectKind: "document", subjectId: id, verb: "deleted",
    });
  }
  return { ok: true };
}
