import type { PageServerLoad } from "./$types";
import { buildDocTree, type DocScope, type DocTreeNode } from "$lib/components/docs/doc-tree";
import { createDocumentApiForEvent } from "$lib/server/document-api";

interface DocRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string;
  body_excerpt: string;
}

interface PublicDocument {
  id: string;
  title: string;
  type?: string;
  docType?: string;
  projectId?: string | null;
  project_id?: string | null;
  frontmatter?: Record<string, unknown>;
  bodyMd?: string;
  body_md?: string;
  updatedAt?: string;
  updated_at?: string;
}

function toDocRow(doc: PublicDocument): DocRow {
  const frontmatter = doc.frontmatter ?? {};
  const body = doc.bodyMd ?? doc.body_md ?? "";
  const kind = typeof frontmatter.kind === "string" ? frontmatter.kind : doc.docType ?? doc.type;
  return {
    id: doc.id,
    title: doc.title,
    kind: kind || "document",
    project_id: doc.projectId ?? doc.project_id ?? null,
    updated_at: doc.updatedAt ?? doc.updated_at ?? "",
    body_excerpt: body.slice(0, 200),
  };
}

function loadDocTree(docs: DocRow[], scope: DocScope, activeProjectId: string | null): DocTreeNode[] {
  return buildDocTree(
    docs
      .filter((doc) => scope === "global" ? doc.project_id === null : doc.project_id === activeProjectId)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        slug: doc.id,
        parentId: null,
        projectId: doc.project_id,
        scope,
        docType: doc.kind || "note",
        sortPosition: 0,
        children: [],
      })),
  );
}

export const load: PageServerLoad = ({ url, locals, fetch, request }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const kind = url.searchParams.get("kind") ?? "";
  const q = url.searchParams.get("q") ?? "";
  return {
    activeProjectId,
    orgId: locals?.orgId ?? null,
    userId: locals?.userId ?? null,
    kind,
    q,
    streamed: {
      data: (async () => {
        try {
          const allDocs = await createDocumentApiForEvent({ url, locals, fetch, request }).docs.list();
          let documents = (allDocs as PublicDocument[]).map((doc) => toDocRow(doc));
          if (kind) documents = documents.filter((doc) => doc.kind === kind);
          if (q.trim()) {
            const needle = q.trim().toLowerCase();
            documents = documents.filter((doc) =>
              doc.title.toLowerCase().includes(needle) || doc.body_excerpt.toLowerCase().includes(needle)
            );
          }
          const projectTree = loadDocTree(documents, "project", activeProjectId);
          const globalTree = loadDocTree(documents, "global", null);
          return { documents, projectTree, globalTree, error: null };
        } catch (error) {
          console.error("docs:list failed", error);
          return {
            documents: [] as DocRow[],
            projectTree: [] as DocTreeNode[],
            globalTree: [] as DocTreeNode[],
            error: {
              message: "Documents could not load.",
              recovery: "Retry after the local API is reachable.",
              traceId: "docs-list",
            },
          };
        }
      })(),
    },
  };
};
