import { error, fail } from "@sveltejs/kit";
// Server-only superforms entry — avoids the client `SuperDebug.svelte`
// import graph (which pulls in `$app/navigation`/`$app/stores`) in the
// test harness.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { DocumentFormSchema } from "$lib/server/documents.schema";
import { updateDocumentAction } from "$lib/server/documents";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { parseLabels, serializeLabels } from "$lib/markdown/labels";
import {
  parseFrontmatterYaml,
  validateFrontmatter,
  type FrontmatterValue,
} from "$lib/components/docs/frontmatter-ui";
import type { DocType } from "../../../../../../db/entities/docs/enums.ts";

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

function extractLabels(fm: Record<string, unknown>): string[] {
  const raw = (fm as { labels?: unknown }).labels;
  return Array.isArray(raw)
    ? (raw.filter((v): v is string => typeof v === "string") as string[])
    : [];
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<DocRow>(
      `SELECT id, org_id, project_id, kind, title, body, frontmatter, updated_at
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

export const actions: Actions = {
  default: async ({ params, request }) => {
    const form = await superValidate(request.clone(), valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    const fd = await request.formData();
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
      const frontmatter = readFrontmatter(fd, form.data.kind as DocType, rawFm);
      if (!frontmatter.valid) {
        return fail(400, {
          form,
          missingFrontmatter: frontmatter.missingRequired,
        });
      }
      const labels = parseLabels(form.data.labels ?? "");
      await updateDocumentAction(db, {
        id: params.id!,
        orgId,
        title: form.data.title,
        kind: form.data.kind,
        body: form.data.body,
        frontmatter: {
          ...frontmatter.value,
          title: form.data.title,
          kind: form.data.kind,
          labels,
        },
      });
    } finally {
      await db.close();
    }
    return { form };
  },
};

function readFrontmatter(
  fd: FormData,
  docType: DocType,
  previous: FrontmatterValue,
): { valid: true; value: FrontmatterValue } | { valid: false; missingRequired: string[] } {
  const yaml = fd.get("frontmatter_yaml");
  const json = fd.get("frontmatter_json");
  let value = previous;

  if (typeof yaml === "string" && yaml.trim()) {
    const parsed = parseFrontmatterYaml(docType, yaml, previous);
    if (!parsed.ok) return { valid: false, missingRequired: [] };
    value = parsed.value;
  } else if (typeof json === "string" && json.trim()) {
    try {
      const parsed = JSON.parse(json) as unknown;
      value = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as FrontmatterValue)
        : {};
    } catch {
      return { valid: false, missingRequired: [] };
    }
  }

  const validated = validateFrontmatter(docType, value);
  if (!validated.success) {
    return { valid: false, missingRequired: validated.missingRequired };
  }
  return { valid: true, value: validated.value };
}
