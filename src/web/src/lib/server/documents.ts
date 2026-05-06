/**
 * Document actions — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { appendEventOrm } from "./orm-helpers.ts";
import { indexSearchDocumentOrm } from "./orm-helpers.ts";

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

function extractLabels(fm: Record<string, unknown> | null | undefined): string[] {
  const raw = fm && (fm as { labels?: unknown }).labels;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}


export async function createDocumentAction(
  em: EntityManager,
  input: CreateDocumentInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  const fm = input.frontmatter ?? {};
  await em.getKysely<any>()
    .insertInto("documents")
    .values({
      id,
      org_id: input.orgId,
      project_id: input.projectId,
      doc_type: input.kind,
      title: input.title,
      body_md: input.body,
      frontmatter: fm,
    })
    .execute();
  const ctx = { orgId: input.orgId, projectId: input.projectId, subjectKind: "document", subjectId: id } as const;
  await appendEventOrm(em, { ...ctx, actor: "system", verb: "created", payload: { title: input.title, kind: input.kind } });
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
  const changed: string[] = [];
  if (input.title !== undefined) changed.push("title");
  if (input.body !== undefined) changed.push("body_md");
  if (input.kind !== undefined) changed.push("doc_type");
  if (input.frontmatter !== undefined) changed.push("frontmatter");
  if (changed.length === 0) throw new Error("updateDocumentAction: no fields to update");
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch["title"] = input.title;
  if (input.body !== undefined) patch["body_md"] = input.body;
  if (input.kind !== undefined) patch["doc_type"] = input.kind;
  if (input.frontmatter !== undefined) patch["frontmatter"] = input.frontmatter;
  patch["updated_at"] = new Date();
  const rows = await em.getKysely<any>()
    .updateTable("documents")
    .set(patch)
    .where("id", "=", input.id)
    .where("org_id", "=", input.orgId)
    .returning(["org_id", "project_id", "doc_type", "title", "body_md", "frontmatter"])
    .execute() as DocRow[];
  const row = rows[0];
  if (!row) throw new Error(`updateDocumentAction: document not found: ${input.id}`);
  await appendEventOrm(em, {
    orgId: row.org_id, projectId: row.project_id, actor: "system",
    subjectKind: "document", subjectId: input.id, verb: "updated", payload: { changed },
  });
  await indexSearchDocumentOrm(em, {
    orgId: row.org_id, projectId: row.project_id, sourceKind: "document", sourceId: input.id,
    title: row.title, body: row.body ?? row.body_md ?? "", labels: extractLabels(row.frontmatter),
  });
  return { ok: true };
}

export async function deleteDocumentAction(em: EntityManager, id: string, orgId: string): Promise<{ ok: true }> {
  const db = em.getKysely<any>();
  await db.deleteFrom("search_documents")
    .where("entity_kind", "=", "document")
    .where("entity_id", "=", id)
    .where("org_id", "=", orgId)
    .execute();
  const rows = await db.deleteFrom("documents")
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .returning(["org_id", "project_id"])
    .execute() as Array<{ org_id: string; project_id: string | null }>;
  const row = rows[0];
  if (row) {
    await appendEventOrm(em, {
      orgId: row.org_id, projectId: row.project_id, actor: "system",
      subjectKind: "document", subjectId: id, verb: "deleted",
    });
  }
  return { ok: true };
}
