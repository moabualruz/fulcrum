import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { deleteDocumentAction } from "$lib/server/documents";

interface DocRow {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: Date | string;
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const rows = await db.query<DocRow>(
      `SELECT id, org_id, project_id, kind, title, body, frontmatter, updated_at
         FROM documents WHERE id = $1`,
      [params.id],
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
      frontmatter: row.frontmatter ?? {},
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    };
    return { doc };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  delete: async ({ params }) => {
    const db = await openProductDb();
    try {
      await deleteDocumentAction(db, params.id!);
    } finally {
      await db.close();
    }
    throw redirect(303, "/docs");
  },
};
