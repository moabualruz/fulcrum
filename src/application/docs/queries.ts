import type { EntityManager } from "@mikro-orm/postgresql";

import { Document } from "../../db/entities/docs/Document.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, DocDto } from "./types.ts";

export async function listDocs(em: EntityManager, ctx: AppContext): Promise<DocDto[]> {
  const docs = await em.find(Document, { org: ctx.orgId, archived: false } as never, {
    orderBy: { updatedAt: "DESC", id: "ASC" },
  });
  return docs.map(serializeDoc);
}

export async function getDoc(em: EntityManager, ctx: AppContext, id: string): Promise<DocDto> {
  const doc = await em.findOne(Document, { id } as never);
  if (!doc) throw new AppNotFoundError(`Document not found: ${id}`);
  if (doc.org.id !== ctx.orgId) throw new AppForbiddenError(`Document does not belong to org: ${ctx.orgId}`);
  return serializeDoc(doc);
}

export function serializeDoc(doc: Document): DocDto {
  return {
    id: doc.id,
    orgId: doc.org.id,
    projectId: doc.projectId,
    title: doc.title ?? String(doc.frontmatter.title ?? "Untitled"),
    bodyMd: doc.bodyMd,
    archived: doc.archived,
    updatedAt: doc.updatedAt,
  };
}
