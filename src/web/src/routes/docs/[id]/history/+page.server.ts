import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import type { ProductDb } from "../../../../../../product-kernel/db/types.ts";

interface DocRow {
  id: string;
  org_id: string;
  title: string;
  body: string;
}

interface VersionRow {
  id: string;
  version_num: number;
  snapshot: Record<string, unknown> | null;
  body_md_snapshot: string | null;
  restore_of: string | null;
  created_at: Date | string;
}

export const load: PageServerLoad = async ({ params, url }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const doc = await loadDoc(db, params.id, orgId);
    const versions = await loadVersions(db, params.id, orgId);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const diffHtml = Number.isInteger(from) && Number.isInteger(to)
      ? diffVersions(versions, from, to)
      : "";
    return { doc, versions, diffHtml };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  restore: async ({ params, request }) => {
    const fd = await request.formData();
    const versionNum = Number(fd.get("version_num"));
    if (!Number.isInteger(versionNum)) return error(400, "version_num is required");
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await restoreVersion(db, params.id!, orgId, versionNum);
    } finally {
      await db.close();
    }
    throw redirect(303, `/docs/${params.id}`);
  },
};

async function loadDoc(db: ProductDb, id: string, orgId: string): Promise<DocRow> {
  const rows = await db.query<DocRow>(
    `SELECT id, org_id, title, body FROM documents WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const row = rows[0];
  if (!row) throw error(404, "Document not found");
  return row;
}

async function loadVersions(
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<Array<{
  id: string;
  versionNum: number;
  isSnapshot: boolean;
  bodyMdSnapshot: string;
  restoreOfId: string | null;
  createdAt: string;
}>> {
  if (!(await relationExists(db, "doc_versions"))) return [];
  const rows = await db.query<VersionRow>(
    `SELECT id, version_num, snapshot, body_md_snapshot, restore_of, created_at
       FROM doc_versions
      WHERE doc_id = $1 AND org_id = $2
      ORDER BY version_num DESC`,
    [id, orgId],
  );
  return rows.map((row) => ({
    id: row.id,
    versionNum: row.version_num,
    isSnapshot: row.snapshot !== null,
    bodyMdSnapshot: row.body_md_snapshot ?? "",
    restoreOfId: row.restore_of,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

function diffVersions(
  versions: Array<{ versionNum: number; bodyMdSnapshot: string }>,
  from: number,
  to: number,
): string {
  const fromBody = versions.find((version) => version.versionNum === from)?.bodyMdSnapshot ?? "";
  const toBody = versions.find((version) => version.versionNum === to)?.bodyMdSnapshot ?? "";
  return `<div data-doc-history-diff><del>${escapeHtml(fromBody)}</del><ins>${escapeHtml(toBody)}</ins></div>`;
}

async function restoreVersion(
  db: ProductDb,
  id: string,
  orgId: string,
  versionNum: number,
): Promise<void> {
  const versions = await db.query<VersionRow>(
    `SELECT id, version_num, snapshot, body_md_snapshot, restore_of, created_at
       FROM doc_versions
      WHERE doc_id = $1 AND org_id = $2 AND version_num = $3`,
    [id, orgId, versionNum],
  );
  const version = versions[0];
  if (!version) throw error(404, "Version not found");
  await db.query(
    `UPDATE documents SET body = $3, updated_at = now() WHERE id = $1 AND org_id = $2`,
    [id, orgId, version.body_md_snapshot ?? ""],
  );
  const latest = await db.query<{ next: number }>(
    `SELECT COALESCE(max(version_num), 0)::int + 1 AS next
       FROM doc_versions
      WHERE doc_id = $1 AND org_id = $2`,
    [id, orgId],
  );
  await db.query(
    `INSERT INTO doc_versions (org_id, doc_id, version_num, snapshot, body_md_snapshot, restore_of)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [
      orgId,
      id,
      latest[0]?.next ?? 1,
      JSON.stringify(version.snapshot ?? {}),
      version.body_md_snapshot ?? "",
      version.id,
    ],
  );
}

async function relationExists(db: ProductDb, name: string): Promise<boolean> {
  const rows = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [name],
  );
  return rows[0]?.exists === true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
