import type { PageServerLoad } from "./$types";
import { listDocs } from "../../../../application/docs/queries.ts";
import { buildDocTree, type DocScope, type DocTreeNode } from "$lib/components/docs/doc-tree";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";

interface DocRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string;
  body_excerpt: string;
}

function isoStamp(value: Date): string {
  return value.toISOString();
}

function toDocRow(doc: Awaited<ReturnType<typeof listDocs>>[number], kind: string): DocRow {
  return {
    id: doc.id,
    title: doc.title,
    kind: kind || "document",
    project_id: doc.projectId,
    updated_at: isoStamp(doc.updatedAt),
    body_excerpt: doc.bodyMd.slice(0, 200),
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

export const load: PageServerLoad = ({ url, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const kind = url.searchParams.get("kind") ?? "";
  const q = url.searchParams.get("q") ?? "";
  return {
    activeProjectId,
    kind,
    q,
    streamed: {
      data: (async () => {
        const em = locals.em ?? await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const allDocs = await listDocs(em, { orgId, userId: null, projectId: activeProjectId });
        let documents = allDocs.map((doc) => toDocRow(doc, kind));
        if (kind) documents = documents.filter((doc) => doc.kind === kind);
        if (q.trim()) {
          const needle = q.trim().toLowerCase();
          documents = documents.filter((doc) =>
            doc.title.toLowerCase().includes(needle) || doc.body_excerpt.toLowerCase().includes(needle)
          );
        }
        const projectTree = loadDocTree(documents, "project", activeProjectId);
        const globalTree = loadDocTree(documents, "global", null);
        return { documents, projectTree, globalTree };
      })(),
    },
  };
};
