/**
 * Document actions — migrated from raw ProductDb to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { appendEventOrm, indexSearchDocumentOrm } from "./orm-helpers.ts";

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
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

function extractLabels(fm: Record<string, unknown> | null | undefined): string[] {
  const raw = fm && (fm as { labels?: unknown }).labels;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

async function ensureDocLinksCompatibility(em: EntityManager): Promise<void> {
  const conn = em.getConnection();
  await conn.execute(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS from_doc_id text REFERENCES documents(id)`);
  await conn.execute(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS to_doc_id text REFERENCES documents(id)`);
  await conn.execute(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS to_slug text`);
  await conn.execute(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS link_kind text NOT NULL DEFAULT 'wikilink'`);
  await conn.execute(`ALTER TABLE doc_links ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`);
  await conn.execute(`ALTER TABLE doc_links ALTER COLUMN source_doc_id DROP NOT NULL`);
  await conn.execute(`ALTER TABLE doc_links ALTER COLUMN target_doc_id DROP NOT NULL`);
}

export async function createDocumentAction(
  em: EntityManager,
  input: CreateDocumentInput,
): Promise<{ id: string }> {
  await ensureDocLinksCompatibility(em);
  const id = randomUUID();
  const fm = input.frontmatter ?? {};
  const conn = em.getConnection();
  await conn.execute(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body, frontmatter, source_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [id, input.orgId, input.projectId, input.kind, input.title, input.body, JSON.stringify(fm), input.sourcePath ?? null],
  );
  await appendEventOrm(em, {
    orgId: input.orgId, projectId: input.projectId,
    actor: "system", subjectKind: "document", subjectId: id,
    verb: "created", payload: { title: input.title, kind: input.kind },
  });
  await indexSearchDocumentOrm(em, {
    orgId: input.orgId, projectId: input.projectId, sourceKind: "document", sourceId: id,
    title: input.title, body: input.body, labels: extractLabels(fm),
  });
  return { id };
}

export async function updateDocumentAction(
  em: EntityManager,
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
  const idIdx = params.length;
  params.push(input.orgId);
  const orgIdx = params.length;
  const conn = em.getConnection();
  const rows = await conn.execute<DocRow[]>(
    `UPDATE documents SET ${sets.join(", ")}
       WHERE id = $${idIdx} AND org_id = $${orgIdx}
     RETURNING org_id, project_id, kind, title, body, frontmatter`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error(`updateDocumentAction: document not found: ${input.id}`);
  await appendEventOrm(em, {
    orgId: row.org_id, projectId: row.project_id, actor: "system",
    subjectKind: "document", subjectId: input.id, verb: "updated", payload: { changed },
  });
  await indexSearchDocumentOrm(em, {
    orgId: row.org_id, projectId: row.project_id, sourceKind: "document", sourceId: input.id,
    title: row.title, body: row.body, labels: extractLabels(row.frontmatter),
  });
  return { ok: true };
}

export async function deleteDocumentAction(em: EntityManager, id: string, orgId: string): Promise<{ ok: true }> {
  const conn = em.getConnection();
  await conn.execute(
    `DELETE FROM search_documents
       WHERE source_kind = 'document' AND source_id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const rows = await conn.execute<{ org_id: string; project_id: string | null }[]>(
    `DELETE FROM documents WHERE id = $1 AND org_id = $2 RETURNING org_id, project_id`,
    [id, orgId],
  );
  const row = rows[0];
  if (row) {
    await appendEventOrm(em, {
      orgId: row.org_id, projectId: row.project_id, actor: "system",
      subjectKind: "document", subjectId: id, verb: "deleted",
    });
  }
  return { ok: true };
}
