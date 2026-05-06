import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { Document } from "../../db/entities/docs/Document.ts";
import { AppValidationError } from "../errors.ts";
import { serializeDoc } from "./queries.ts";
import type { AppContext, CreateDocInput, DocDto } from "./types.ts";

export async function createDoc(em: EntityManager, ctx: AppContext, input: CreateDocInput): Promise<DocDto> {
  if (!input.title?.trim()) throw new AppValidationError("Document title is required.");
  return await em.transactional(async (txEm) => {
    const doc = txEm.create(Document, {
      org: txEm.getReference(Org, ctx.orgId),
      projectId: input.projectId ?? ctx.projectId ?? null,
      title: input.title,
      frontmatter: { title: input.title },
      bodyMd: input.bodyMd ?? "",
      contentJson: {},
      updatedAt: new Date(),
    });
    txEm.persist(doc);
    await txEm.flush();
    return serializeDoc(doc);
  });
}
