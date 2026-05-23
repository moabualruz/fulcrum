import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
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
  try {
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
    return { tree: buildDocTree(flat), error: null as null };
  } catch (err) {
    console.error("docs:global list failed", err);
    return {
      tree: [] as ReturnType<typeof buildDocTree>,
      error: {
        message: "Global documents could not load.",
        recovery: "Retry after the local API is reachable.",
        traceId: "docs-global",
      },
    };
  }
};

export const actions: Actions = {
  reorder: async (event) => {
    const fd = await event.request.formData();
    const docId = stringField(fd, "docId");
    const parentId = nullableField(fd, "parentId");
    const sortPosition = numberField(fd, "sortPosition");

    if (!docId) return fail(400, { error: "docId is required" });
    if (sortPosition === null) return fail(400, { error: "sortPosition is required" });

    await createDocumentApiForEvent(event).docs.update({
      id: docId,
      parentId,
      sortPosition,
    });

    return { ok: true };
  },
};

function stringField(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableField(fd: FormData, key: string): string | null {
  const value = stringField(fd, key);
  return value === "" || value === "root" ? null : value;
}

function numberField(fd: FormData, key: string): number | null {
  const value = stringField(fd, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
