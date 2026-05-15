import type { PageServerLoad } from "./$types";
import { buildDocTree, type FlatDoc } from "$lib/server/doc-tree";
import { createDocumentApiForEvent } from "$lib/server/document-api";

interface PublicDocument {
  id: string;
  title: string;
  type?: string;
  docType?: string;
  projectId?: string | null;
  project_id?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
  sortOrder?: number;
  sort_order?: number;
  frontmatter?: Record<string, unknown>;
  updatedAt?: string;
  updated_at?: string;
}

export const load: PageServerLoad = async (event) => {
  const rows = (await createDocumentApiForEvent(event).docs.list() as PublicDocument[])
    .filter((doc) => (doc.projectId ?? doc.project_id ?? null) === null);
  const flat: FlatDoc[] = rows.map((doc) => ({
    id: doc.id,
    title: doc.title,
    kind: typeof doc.frontmatter?.kind === "string" ? doc.frontmatter.kind : doc.docType ?? doc.type ?? "note",
    parent_id: doc.parentId ?? doc.parent_id ?? null,
    sort_order: doc.sortOrder ?? doc.sort_order ?? 0,
    updated_at: doc.updatedAt ?? doc.updated_at ?? "",
  }));
  return { tree: buildDocTree(flat) };
};
