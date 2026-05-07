import { fail, redirect } from "@sveltejs/kit";
// Server-only superforms entry — avoids the client `SuperDebug.svelte`
// import graph (which pulls in `$app/navigation`/`$app/stores`) in the test
// harness.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { DocumentFormSchema } from "$lib/server/documents.schema";
import { createDocumentAction } from "@/application/docs/document-actions.ts";
import { parseLabels } from "$lib/markdown/labels";
import { TEMPLATE_BODY_MAP } from "@/docs/template-seeds.ts";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
} from "@/docs/doc-template-service.ts";
import { requestAppScope } from "$lib/server/application-scope";

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
        templates[String(row.docType)] = row.bodyTemplate;
      }
    } catch {
      // service not bound — keep static fallback
    }
  }

  return { form, templates };
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    let id: string;
    {
      const { em, ctx } = await requestAppScope(locals, form.data.projectId ?? null);
      const labels = parseLabels(form.data.labels ?? "");
      const created = await createDocumentAction(em, {
        orgId: ctx.orgId,
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
    }
    throw redirect(303, `/docs/${id}`);
  },
};
