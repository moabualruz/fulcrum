import { error, fail } from "@sveltejs/kit";
// Server-only superforms entry — avoids the client `SuperDebug.svelte`
// import graph (which pulls in `$app/navigation`/`$app/stores`) in the
// test harness.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import { DocumentFormSchema } from "@fulcrum/lib/server/documents.schema.ts";
import { updateDocumentAction } from "@fulcrum/lib/server/documents.ts";
import { openProductDb, getDefaultOrgId } from "@fulcrum/lib/server/db.ts";
import { parseLabels, serializeLabels } from "@fulcrum/lib/markdown/labels.ts";
import { createDocumentVersion, getNextVersionNumber } from "@fulcrum/lib/server/doc-versions.ts";

interface DocRow {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  content_json?: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
  updated_at: Date | string;
}

interface LoadEvent {
  params: { id: string };
}

interface ActionEvent {
  params: { id: string };
  request: Request;
}

function extractLabels(fm: Record<string, unknown>): string[] {
  const raw = (fm as { labels?: unknown }).labels;
  return Array.isArray(raw)
    ? (raw.filter((v): v is string => typeof v === "string") as string[])
    : [];
}

export const load = async ({ params }: LoadEvent) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<DocRow>(
      `SELECT id, org_id, project_id, kind, title, body, content_json, frontmatter, updated_at
         FROM documents WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (rows.length === 0) throw error(404, "Document not found");
    const row = rows[0]!;
    const doc = {
      id: row.id,
      org_id: row.org_id,
      project_id: row.project_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      contentJson: row.content_json ?? {},
      frontmatter: row.frontmatter ?? {},
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
    const form = await superValidate(
      {
        title: doc.title,
        kind: doc.kind,
        labels: serializeLabels(extractLabels(doc.frontmatter)),
        body: doc.body,
        projectId: doc.project_id,
      },
      valibot(DocumentFormSchema),
    );
    return { doc, form };
  } finally {
    await db.close();
  }
};

export const actions = {
  default: async ({ params, request }: ActionEvent) => {
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      // Re-read current frontmatter so non-form keys (e.g. `id`, `status`,
      // anything 04.2's `readFrontmatterForm` would route to `rawFrontmatter`)
      // survive the round-trip — issue 15 byte-stability follow-up depends
      // on this.
      const rows = await db.query<{ frontmatter: Record<string, unknown> }>(
        `SELECT frontmatter FROM documents WHERE id = $1 AND org_id = $2`,
        [params.id, orgId],
      );
      if (rows.length === 0) throw error(404, "Document not found");
      const rawFm = rows[0]?.frontmatter ?? {};
      const labels = parseLabels(form.data.labels ?? "");
      const mergedFm = {
        ...rawFm,
        title: form.data.title,
        kind: form.data.kind,
        labels,
      };
      await updateDocumentAction(db, {
        id: params.id!,
        orgId,
        title: form.data.title,
        kind: form.data.kind,
        body: form.data.body,
        frontmatter: mergedFm,
      });
      // Record version snapshot after save
      const nextVer = await getNextVersionNumber(db, params.id!);
      await createDocumentVersion(db, {
        docId: params.id!,
        orgId,
        version: nextVer,
        title: form.data.title,
        body: form.data.body,
        frontmatter: mergedFm,
        author: "user",
      });
    } finally {
      await db.close();
    }
    return { form };
  },
};
