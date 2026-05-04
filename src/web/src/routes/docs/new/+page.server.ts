import { fail, redirect } from "@sveltejs/kit";
// Server-only superforms entry — avoids the client `SuperDebug.svelte`
// import graph (which pulls in `$app/navigation`/`$app/stores`) in the test
// harness.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { DocumentFormSchema } from "$lib/server/documents.schema";
import { createDocumentAction } from "$lib/server/documents";
import { openProductDb } from "$lib/server/db";
import { parseLabels } from "$lib/markdown/labels";
import { TEMPLATE_BODY_MAP } from "@fulcrum/docs/template-seeds.ts";
import type { DocType } from "@fulcrum/db/entities/docs/enums.ts";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
} from "@fulcrum/docs/doc-template-service.ts";

// ─── Load ────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async (event) => {
  const form = await superValidate(valibot(DocumentFormSchema));

  // Build template body map: try container-resolved service first,
  // fall back to static seed constants (no DB round-trip required).
  const templates: Record<string, string> = { ...TEMPLATE_BODY_MAP };

  // event.locals is provided in production (SvelteKit request) and in
  // web-surface tests; absent in legacy unit tests that call load() directly.
  const locals = (event as unknown as { locals?: Record<string, unknown> } | undefined)?.locals as
    | Record<string, unknown>
    | undefined;
  const container = locals?.["container"] as
    | import("@needle-di/core").Container
    | null
    | undefined;
  const orgId = locals?.["orgId"] as string | null | undefined;

  if (container && orgId) {
    try {
      const svc = container.get(DOC_TEMPLATE_SERVICE_TOKEN);
      const rows = await svc.list(orgId);
      for (const row of rows) {
        templates[row.docType as DocType] = row.bodyTemplate;
      }
    } catch {
      // service not bound — keep static fallback
    }
  }

  return { form, templates };
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    const db = await openProductDb();
    let id: string;
    try {
      const orgRows = await db.query<{ id: string }>(
        `SELECT id FROM orgs WHERE slug = $1`,
        ["default"],
      );
      if (orgRows.length === 0) {
        return fail(500, {
          form: {
            ...form,
            errors: {
              ...form.errors,
              _errors: ["Default org not found. Run fulcrum product init."],
            },
          },
        });
      }
      const orgId = orgRows[0]!.id;
      const labels = parseLabels(form.data.labels ?? "");
      const created = await createDocumentAction(db, {
        orgId,
        projectId: form.data.projectId ?? null,
        kind: form.data.kind,
        title: form.data.title,
        body: form.data.body,
        frontmatter: {
          title: form.data.title,
          kind: form.data.kind,
          labels,
        },
      });
      id = created.id;
    } finally {
      await db.close();
    }
    throw redirect(303, `/docs/${id}`);
  },
};
