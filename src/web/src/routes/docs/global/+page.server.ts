import type { PageServerLoad } from "./$types";
import { listDocs } from "../../../../../application/docs/queries.ts";
import { buildDocTree, type FlatDoc } from "$lib/server/doc-tree";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ locals }) => {
  const { em, ctx } = await requestAppScope(locals);
  const rows = (await listDocs(em, ctx, {})).filter((doc) => doc.projectId === null);
  const flat: FlatDoc[] = rows.map((doc) => ({
    id: doc.id,
    title: doc.title,
    kind: doc.docType,
    parent_id: doc.parentId,
    sort_order: doc.sortPosition,
    updated_at: doc.updatedAt.toISOString(),
  }));
  return { tree: buildDocTree(flat) };
};
