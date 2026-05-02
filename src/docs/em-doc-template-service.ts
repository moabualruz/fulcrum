/**
 * EntityManagerDocTemplateService — MikroORM-backed implementation of DocTemplateService.
 *
 * Used as the fallback when no mock is bound in the DI container.
 * Queries the doc_templates table via the forked EntityManager in tRPC context.
 *
 * C6: No raw SQL — uses em.find / em.findOne with FilterQuery.
 * C7: MikroORM v7 EntityManager.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import type { DocType } from "../db/entities/docs/enums.ts";
import type { DocTemplateRow, DocTemplateService } from "./doc-template-service.ts";

export class EntityManagerDocTemplateService implements DocTemplateService {
  constructor(private readonly em: EntityManager) {}

  async list(orgId: string, projectId?: string | null): Promise<DocTemplateRow[]> {
    const { DocTemplate } = await import("../db/entities/docs/DocTemplate.ts");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, unknown> = { org: orgId } as any;
    if (projectId !== undefined) {
      where["projectId"] = projectId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await this.em.find(DocTemplate, where as any, { orderBy: { docType: "ASC" } });
    return rows.map(toRow);
  }

  async resolve(
    orgId: string,
    projectId: string | null,
    docType: DocType,
  ): Promise<DocTemplateRow | null> {
    const { DocTemplate } = await import("../db/entities/docs/DocTemplate.ts");

    if (projectId) {
      const specific = await this.em.findOne(DocTemplate, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        org: orgId, projectId, docType, isDefault: true,
      } as any);
      if (specific) return toRow(specific);
    }

    const fallback = await this.em.findOne(DocTemplate, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      org: orgId, projectId: null, docType, isDefault: true,
    } as any);

    return fallback ? toRow(fallback) : null;
  }
}

function toRow(
  tmpl: import("../db/entities/docs/DocTemplate.ts").DocTemplate,
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
