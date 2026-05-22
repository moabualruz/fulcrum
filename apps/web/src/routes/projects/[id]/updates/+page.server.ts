import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { ensureProjectExists } from "$lib/server/project-api";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type ContinuousUpdateTrigger = "manual_doc_edit" | "acp_session_update";

export const load: PageServerLoad = async (event) => {
  await ensureProjectExists(event, event.params.id);
  return { projectId: event.params.id };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of fd.entries()) out[key] = typeof value === "string" ? value : null;
  return out;
}

function parseTrigger(value: string | null | undefined): ContinuousUpdateTrigger {
  const normalized = value?.trim();
  if (normalized === "manual_doc_edit" || normalized === "acp_session_update") return normalized;
  throw new Error(`Unsupported trigger type: ${normalized ?? "(empty)"}`);
}

export const actions: Actions = {
  triggerUpdate: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const trigger = parseTrigger(raw["trigger"]);
      const userPrompt = raw["userPrompt"]?.trim();
      if (!userPrompt) return fail(400, { ok: false, message: "User prompt is required." });

      const result = await workflowApi(event).planning.restartPlanningCycleFromUpdates({
        ...workflowApiProjectMetadata(event, event.params.id),
        trigger,
        userPrompt,
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
      }) as ContinuousUpdateResult;

      return {
        ok: true,
        result: {
          status: result.status,
          trigger: result.trigger,
          traceId: result.traceId,
          eventId: result.eventId,
          changedDocCount: result.changedDocs.length,
          targetTaskCount: result.targetTaskIds.length,
        },
      };
    } catch (err) {
      return fail(400, { ok: false, message: (err as Error).message });
    }
  },

  triggerAndRedirect: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    try {
      const trigger = parseTrigger(raw["trigger"]);
      const userPrompt = raw["userPrompt"]?.trim();
      if (!userPrompt) return fail(400, { ok: false, message: "User prompt is required." });

      await workflowApi(event).planning.restartPlanningCycleFromUpdates({
        ...workflowApiProjectMetadata(event, event.params.id),
        trigger,
        userPrompt,
        projectId: event.params.id,
        traceId: raw["traceId"]?.trim() || undefined,
      });
    } catch (err) {
      return fail(400, { ok: false, message: (err as Error).message });
    }

    throw redirect(303, `/projects/${event.params.id}`);
  },
};

interface ContinuousUpdateResult {
  status: string;
  trigger: string;
  traceId?: string;
  eventId?: string;
  changedDocs: unknown[];
  targetTaskIds: unknown[];
}

function workflowApi(event: Parameters<Actions[keyof Actions]>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
