import { fail, redirect, type Actions, type PageServerLoad } from "@sveltejs/kit";
import { createArtifactApiForEvent } from "$lib/server/artifact-api";

/**
 * `/artifacts` is re-homed to the Ship stage workbench (`/ship`) per
 * `IA-MAP.md §2.5` and `design-alignment/ship.md`: the generic file-artifact
 * list is a subset of the Ship release surface. The list `load` issues a 301
 * (`MOVED_PERMANENTLY`) redirect to `/ship`, carrying the filter query string
 * forward so a bookmarked `/artifacts?mime=…` lands on the same filtered Ship
 * view.
 *
 * No feature loss: the `upload` and `bulk` (archive/delete) server actions and
 * the `/artifacts/[id]/download` endpoint are preserved verbatim below and at
 * their existing paths: the redirect only re-homes the *list view*, not the
 * artifact mutation endpoints, so bulk archive/delete and download carry
 * forward exactly as before.
 */
export const load: PageServerLoad = ({ url }) => {
  const query = url.search ? url.search : "";
  // 301 MOVED_PERMANENTLY: the canonical Ship route is the permanent home.
  redirect(301, `/ship${query}`);
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
