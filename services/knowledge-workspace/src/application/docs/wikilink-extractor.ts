import { randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { DocLink } from "@platform-core/infrastructure/application-database/entities/docs/DocLink.ts";
import { Document } from "@platform-core/infrastructure/application-database/entities/docs/Document.ts";

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

export function extractWikilinkSlugs(contentJson: Record<string, unknown>): string[] {
  const slugs = new Set<string>();

  function visit(node: JsonNode): void {
    if (node.type === "wikilink" && typeof node.attrs?.slug === "string") {
      const slug = node.attrs.slug.trim();
      if (slug) slugs.add(slug);
    }
    for (const child of node.content ?? []) visit(child);
  }

  visit(contentJson as JsonNode);
  return [...slugs].sort();
}

export async function syncDocWikilinks(
  em: EntityManager,
  orgId: string,
  fromDoc: Document,
  contentJson: Record<string, unknown>,
): Promise<void> {
  const slugs = extractWikilinkSlugs(contentJson);
  const existing = await em.find(DocLink, {
    org: orgId,
    fromDoc: fromDoc.id,
    linkKind: "wikilink",
  } as never, { populate: ["toDoc"] });
  const wanted = new Set(slugs);

  for (const link of existing) {
    if (!wanted.has(link.toSlug)) em.remove(link);
  }

  for (const slug of slugs) {
    const current = existing.find((link) => link.toSlug === slug);
    const target = await em.findOne(Document, { org: orgId, externalId: slug, archived: false } as never);
    if (current) {
      current.toDoc = target;
      em.persist(current);
      continue;
    }

    em.persist(em.create(DocLink, {
      id: randomUUID(),
      org: em.getReference(Org, orgId),
      fromDoc,
      toDoc: target,
      toSlug: slug,
      linkKind: "wikilink",
      anchor: null,
      createdAt: new Date(),
    } as never));
  }
}
