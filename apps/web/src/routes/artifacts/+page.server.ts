import { fail, type Actions, type PageServerLoad } from "@sveltejs/kit";
import { createArtifactApiForEvent, type PublicArtifact, toArtifactRow } from "$lib/server/artifact-api";

export const load: PageServerLoad = (event) => {
  const { url, locals } = event;
  const mime = (url.searchParams.get("mime") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();
  const run = (url.searchParams.get("run") ?? "").trim();
  const task = (url.searchParams.get("task") ?? "").trim();
  const trace = (url.searchParams.get("trace") ?? "").trim();
  const archived = url.searchParams.get("archived") ?? "";
  const projectParam = url.searchParams.get("project");
  const projectRaw = projectParam === null ? undefined : projectParam.trim();

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filter: { mime, kind, project: projectRaw ?? "", run, task, trace, archived },
    streamed: {
      data: (async () => {
        try {
          const artifacts = await createArtifactApiForEvent(event).artifacts.list({
            mime: mime || null,
            kind: kind || null,
            projectId: projectRaw,
            runId: run || null,
            taskId: task || null,
            traceId: trace || null,
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
  upload: async (event) => {
    const form = await event.request.formData();
    const filename = stringField(form, "filename");
    const projectId = stringField(form, "projectId");
    const traceId = stringField(form, "traceId");
    const mime = stringField(form, "mime");
    const sizeBytes = numberField(form, "sizeBytes");
    if (!filename || !projectId || !traceId || !mime || sizeBytes === null) {
      return fail(400, { ok: false, mode: "upload", message: "Filename, project, trace, MIME, and size are required." });
    }

    const artifact = await createArtifactApiForEvent(event).artifacts.upload({
      filename,
      title: stringField(form, "title") || filename,
      projectId,
      traceId,
      runId: nullableField(form, "runId"),
      taskId: nullableField(form, "taskId"),
      docId: nullableField(form, "docId"),
      kind: stringField(form, "kind") || "file",
      mime,
      sizeBytes,
      bodyPath: nullableField(form, "bodyPath"),
      metadataJson: {
        source: "web-artifacts-upload",
      },
    });
    return { ok: true, mode: "upload", artifact };
  },
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

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableField(form: FormData, key: string): string | null {
  const value = stringField(form, key);
  return value.length > 0 ? value : null;
}

function numberField(form: FormData, key: string): number | null {
  const value = stringField(form, key);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  } catch {
    return [];
  }
}
