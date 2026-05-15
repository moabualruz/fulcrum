/**
 * EntityManagerDocTemplateService — MikroORM-backed implementation of DocTemplateService.
 *
 * Used as the fallback when no mock is bound in the DI container.
 * Queries the doc_templates table via the forked EntityManager in tRPC context.
 */

import type { EntityManager } from "typeorm";
import type { DocType } from "@knowledge-workspace/infrastructure/database/entities/docs/enums.ts";
import type { DocTemplateRow, DocTemplateService } from "./doc-template-service.ts";
import { builtinTemplateRow, builtinTemplateRows } from "./template-seeds.ts";

export class EntityManagerDocTemplateService implements DocTemplateService {
  constructor(private readonly em: EntityManager) {}

  async list(orgId: string, projectId?: string | null): Promise<DocTemplateRow[]> {
    const { DocTemplate } = await import("@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, unknown> = projectId
      ? { org: { id: orgId }, $or: [{ projectId }, { projectId: null }] } as any
      : { org: { id: orgId }, projectId: null } as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await this.em.find(DocTemplate, { where: where as any, order: { docType: "ASC" } });
    return withBuiltInDefaults(orgId, rows.map(toRow));
  }

  async resolve(
    orgId: string,
    projectId: string | null,
    docType: DocType,
  ): Promise<DocTemplateRow | null> {
    const { DocTemplate } = await import("@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts");

    if (projectId) {
      const specific = await this.em.findOne(DocTemplate, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        org: { id: orgId }, projectId, docType, isDefault: true,
      } as any);
      if (specific) return toRow(specific);
    }

    const fallback = await this.em.findOne(DocTemplate, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      org: { id: orgId }, projectId: null, docType, isDefault: true,
    } as any);

    return fallback ? toRow(fallback) : builtinTemplateRow(orgId, docType);
  }
}

function withBuiltInDefaults(
  orgId: string,
  rows: DocTemplateRow[],
): DocTemplateRow[] {
  const dbDefaultDocTypes = new Set(
    rows
      .filter((row) => row.projectId === null && row.isDefault)
      .map((row) => row.docType),
  );
  const builtIns = builtinTemplateRows(orgId).filter(
    (row) => !dbDefaultDocTypes.has(row.docType),
  );

  return [...rows, ...builtIns].sort((a, b) => {
    const projectRank = Number(a.projectId !== null) - Number(b.projectId !== null);
    if (projectRank !== 0) return projectRank;
    const docTypeRank = a.docType.localeCompare(b.docType);
    if (docTypeRank !== 0) return docTypeRank;
    return a.name.localeCompare(b.name);
  });
}

function toRow(
  tmpl: import("@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts").DocTemplate,
): DocTemplateRow {
  const orgId =
    typeof tmpl.org === "object" && tmpl.org !== null && "id" in tmpl.org
      ? (tmpl.org as { id: string }).id
      : String(tmpl.org);

  return {
    id: tmpl.id,
    orgId,
    projectId: tmpl.projectId,
    docType: tmpl.docType,
    name: tmpl.name,
    frontmatterTemplate: tmpl.frontmatterTemplate,
    bodyTemplate: tmpl.bodyTemplate,
    isDefault: tmpl.isDefault,
    createdAt: tmpl.createdAt,
  };
}
