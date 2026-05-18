import { fail, type Actions, type PageServerLoad } from "@sveltejs/kit";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
  const mime = (url.searchParams.get("mime") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const archived = url.searchParams.get("archived") ?? "";
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filter: { mime, kind, project: projectRaw ?? "", archived },
    streamed: {
      data: (async () => {
        try {
          const artifacts = await createArtifactApiForEvent(event).artifacts.list({
            mime: mime || null,
            kind: kind || null,
            projectId: projectRaw,
            archived: archived === "true" ? undefined : false,
          }) as PublicArtifact[];
          return { artifacts: artifacts.map(toArtifactRow), error: null };
        } catch (error) {
          console.error("artifacts:list failed", error);
          return {
            artifacts: [],
            error: {
              message: "Artifacts could not load.",
              recovery: "Retry after the local API is reachable.",
              traceId: "artifacts-list",
            },
          };
        }
      })(),
    },
  };
};

export const actions: Actions = {
  bulk: async (event) => {
    const form = await event.request.formData();
    const ids = parseIds(form.get("ids"));
    const action = String(form.get("action") ?? "");
    if (ids.length === 0) return fail(400, { message: "Select at least one artifact." });
    if (action !== "archive" && action !== "delete") return fail(400, { message: "Choose archive or delete." });

    const api = createArtifactApiForEvent(event).artifacts;
    for (const id of ids) {
      if (action === "archive") await api.archive({ id });
      else await api.delete({ id });
    }
    return { ok: true, action, count: ids.length };
  },
};

function parseIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  } catch {
    return [];
  }
}
