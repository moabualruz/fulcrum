import type { EntityManager } from "typeorm";

import { getDoc } from "@knowledge-workspace/application/docs/queries.ts";
import { DocumentService } from "@knowledge-workspace/application/document-service.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import type { AppContext } from "@knowledge-workspace/application/docs/types.ts";
import type { DocType } from "@knowledge-workspace/infrastructure/database/entities/docs/enums.ts";

export interface DocsEditScope {
  em: EntityManager;
  ctx: AppContext;
}

export interface WebEditDoc {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  contentJson: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
  updated_at: string;
}

export interface SaveWebEditDocInput {
  id: string;
  title: string;
  kind: string;
  labels: string[];
  body: string;
}

export async function loadWebEditDoc(scope: DocsEditScope, id: string): Promise<WebEditDoc> {
  const doc = await getDoc(scope.em, scope.ctx, id);
  if (!doc) throw new AppNotFoundError(`Document not found: ${id}`);
  return {
    id: doc.id,
    org_id: doc.orgId,
    project_id: doc.projectId,
    kind: frontmatterKind(doc.frontmatter) ?? doc.docType,
    title: doc.title,
    body: doc.bodyMd,
    contentJson: doc.contentJson,
    frontmatter: doc.frontmatter,
    updated_at: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

export async function saveWebEditDoc(scope: DocsEditScope, input: SaveWebEditDocInput): Promise<void> {
  const existing = await loadWebEditDoc(scope, input.id);
  const frontmatter = {
    ...existing.frontmatter,
    title: input.title,
    kind: input.kind,
    labels: input.labels,
  };
  const updated = await new DocumentService(scope.em).update({
    orgId: scope.ctx.orgId,
    userId: scope.ctx.userId ?? "",
    em: null,
  }, {
    id: input.id,
    title: input.title,
    docType: persistedDocType(input.kind),
    bodyMd: input.body,
    frontmatter,
  });
  if (!updated) throw new AppNotFoundError(`Document not found: ${input.id}`);
}

function frontmatterKind(frontmatter: Record<string, unknown>): string | null {
  return typeof frontmatter["kind"] === "string" ? frontmatter["kind"] : null;
}

function persistedDocType(kind: string): DocType {
  if (kind === "decision") return "adr";
  return kind as DocType;
}
