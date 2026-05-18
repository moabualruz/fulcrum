import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  restartPlanningCycleFromUpdates,
  type ContinuousUpdateTrigger,
} from "@planning-review/application/continuous-update-actions.ts";
import { ensureProjectExists } from "$lib/server/project-api";
import { requestServiceScope } from "$lib/server/request-service-scope";

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
  triggerUpdate: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const trigger = parseTrigger(raw["trigger"]);
      const userPrompt = raw["userPrompt"]?.trim();
      if (!userPrompt) return fail(400, { ok: false, message: "User prompt is required." });

      const { em, ctx } = await requestServiceScope(locals, params.id);
      const result = await restartPlanningCycleFromUpdates(em, ctx, {
        trigger,
        userPrompt,
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
      });

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

  triggerAndRedirect: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const trigger = parseTrigger(raw["trigger"]);
      const userPrompt = raw["userPrompt"]?.trim();
      if (!userPrompt) return fail(400, { ok: false, message: "User prompt is required." });

      const { em, ctx } = await requestServiceScope(locals, params.id);
      await restartPlanningCycleFromUpdates(em, ctx, {
        trigger,
        userPrompt,
        projectId: params.id,
        traceId: raw["traceId"]?.trim() || undefined,
      });
    } catch (err) {
      return fail(400, { ok: false, message: (err as Error).message });
    }

    throw redirect(303, `/projects/${params.id}`);
  },
};
