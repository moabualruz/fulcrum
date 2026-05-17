import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { DocumentFormSchema } from "$lib/server/documents.schema";
import { parseLabels } from "$lib/markdown/labels";
import { TEMPLATE_BODY_MAP } from "@knowledge-workspace/interface/document-pages.ts";
import { createDocumentApiForEvent } from "$lib/server/document-api";

// ─── Load ────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async () => {
  const form = await superValidate(valibot(DocumentFormSchema));
  const templates: Record<string, string> = { ...TEMPLATE_BODY_MAP };
  return { form, templates };
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async (event) => {
    const { request, locals } = event;
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });

    const projectId = form.data.projectId ?? readActiveProjectId(locals);
    if (!projectId) return fail(400, { form, message: "Project is required." });

    const created = await createDocumentApiForEvent(event).docs.create({
      projectId,
      title: form.data.title,
      type: form.data.kind,
      bodyMd: form.data.body,
      frontmatter: {
        title: form.data.title,
        kind: form.data.kind,
        labels: parseLabels(form.data.labels ?? ""),
      },
    });
    const id = (created as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) return fail(502, { form, message: "Document API returned no id." });
    throw redirect(303, `/docs/${id}`);
  },
};

function readActiveProjectId(locals: App.Locals): string | null {
  const candidate = locals as App.Locals & { activeProjectId?: unknown; projectId?: unknown };
  if (typeof candidate.activeProjectId === "string" && candidate.activeProjectId.length > 0) {
    return candidate.activeProjectId;
  }
  if (typeof candidate.projectId === "string" && candidate.projectId.length > 0) return candidate.projectId;
  return null;
}
