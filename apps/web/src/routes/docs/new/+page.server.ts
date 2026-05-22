import { fail, redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import type { Actions, PageServerLoad } from "./$types";
import { DocumentFormSchema } from "$lib/server/documents.schema";
import { parseLabels } from "$lib/markdown/labels";
import { TEMPLATE_BODY_MAP } from "@knowledge-workspace/interface/document-pages.ts";
import { createDocumentApiForEvent } from "$lib/server/document-api";
import { createProjectApiForEvent } from "$lib/server/project-api";

// ─── Load ────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ url }) => {
  const form = await superValidate(valibot(DocumentFormSchema));
  // `?project=<slug|uuid>` preselects the owning project so a doc created
  // from a Capture stage lands in that project (resolveProjectId in the
  // action accepts a slug or uuid).
  const project = url.searchParams.get("project");
  if (project) form.data.projectId = project;
  const templates: Record<string, string> = { ...TEMPLATE_BODY_MAP };
  return { form, templates };
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {
  default: async (event) => {
    const { request, locals } = event;
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });

    const projectId = await resolveProjectId(event, form.data.projectId ?? readActiveProjectId(locals));

    const created = await createDocumentApiForEvent(event).docs.create({
      ...(projectId ? { projectId } : {}),
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

async function resolveProjectId(event: RequestEvent, candidate: string | null | undefined): Promise<string | null> {
  if (!candidate) return null;
  if (isUuid(candidate)) return candidate;
  const projects = await createProjectApiForEvent(event).projects.list();
  const rows = Array.isArray((projects as { data?: unknown }).data) ? (projects as { data: unknown[] }).data : [];
  const match = rows.find((row) => {
    const project = row as { id?: unknown; slug?: unknown };
    return project.id === candidate || project.slug === candidate;
  }) as { id?: unknown } | undefined;
  return typeof match?.id === "string" ? match.id : candidate;
}

function readActiveProjectId(locals: App.Locals): string | null {
  const candidate = locals as App.Locals & { activeProjectId?: unknown; projectId?: unknown };
  if (typeof candidate.activeProjectId === "string" && candidate.activeProjectId.length > 0) {
    return candidate.activeProjectId;
  }
  if (typeof candidate.projectId === "string" && candidate.projectId.length > 0) return candidate.projectId;
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
