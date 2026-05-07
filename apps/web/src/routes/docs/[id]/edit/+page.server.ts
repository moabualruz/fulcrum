import { error, fail } from "@sveltejs/kit";
// Server-only superforms entry — avoids the client `SuperDebug.svelte`
// import graph (which pulls in `$app/navigation`/`$app/stores`) in the
// test harness.
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import { DocumentFormSchema } from "../../../../lib/server/documents.schema.ts";
import { requestAppScope } from "../../../../lib/server/application-scope.ts";
import { parseLabels, serializeLabels } from "../../../../lib/markdown/labels.ts";
import { AppNotFoundError } from "@/application/errors.ts";
import { loadWebEditDoc, saveWebEditDoc } from "@/application/docs/web-edit.ts";

interface LoadEvent {
  params: { id: string };
  locals: App.Locals;
}

interface ActionEvent {
  params: { id: string };
  locals: App.Locals;
  request: Request;
}

function extractLabels(fm: Record<string, unknown>): string[] {
  const raw = (fm as { labels?: unknown }).labels;
  return Array.isArray(raw)
    ? (raw.filter((v): v is string => typeof v === "string") as string[])
    : [];
}

export const load = async ({ params, locals }: LoadEvent) => {
  const scope = await requestAppScope(locals);
  const doc = await loadWebEditDoc(scope, params.id).catch(mapNotFound);
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
};

export const actions = {
  default: async ({ params, request, locals }: ActionEvent) => {
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    const scope = await requestAppScope(locals);
    await saveWebEditDoc(scope, {
      id: params.id!,
      title: form.data.title,
      kind: form.data.kind,
      labels: parseLabels(form.data.labels ?? ""),
      body: form.data.body,
    }).catch(mapNotFound);
    return { form };
  },
};

function mapNotFound(errorValue: unknown): never {
  if (errorValue instanceof AppNotFoundError) throw error(404, "Document not found");
  throw errorValue;
}
