import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  completeProjectSprint,
  createProjectSprint,
  loadProjectSprints,
  startProjectSprint,
} from "@work-management/interface/project-sprints.ts";
import {
  CreateSprintSchema,
  StartSprintSchema,
  CompleteSprintSchema,
} from "$lib/server/sprints.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { generateNarration } from "$lib/server/reports";
import { isFeatureEnabled } from "$lib/server/feature-flags";
import { requestProjectScope } from "../../project-request-scope";
import { loadProjectOverview } from "@work-management/interface/project-lifecycle.ts";

export const load: PageServerLoad = async ({ params, locals }) => {
  const projectId = params.id;
  await ensureProject(locals, projectId);
  return {
    projectId,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestProjectScope(locals, projectId);
        return loadProjectSprints(em, ctx);
      })(),
    },
  };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) {
    out[k] = typeof vRaw === "string" ? vRaw : null;
  }
  return out;
}

export const actions: Actions = {
  createSprint: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if (candidate["capacity"]) candidate["capacity"] = Number(candidate["capacity"]);
    const parsed = v.safeParse(CreateSprintSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await createProjectSprint(em, ctx, {
        name: parsed.output.name,
        goal: parsed.output.goal,
        capacity: parsed.output.capacity,
      });
      return actionOk("Sprint created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  startSprint: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(StartSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      await startProjectSprint(em, ctx, parsed.output.id);
      return actionOk("Sprint started");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  completeSprint: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(CompleteSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestProjectScope(locals, params.id);
      const { id: sprintId, metrics } = await completeProjectSprint(em, ctx, parsed.output.id);

      // LLM narrative step: gated behind FULCRUM_FEATURES=report-llm-narration
      const llmEnabled = isFeatureEnabled("report-llm-narration");
      if (llmEnabled) {
        const narration = await generateNarration({
          projectId: params.id,
          sprintId,
          velocity: metrics.velocity,
          completedTasks: metrics.completed_tasks,
          blockedTasks: 0, // best-effort; not in metrics snapshot
          cycleTimeDays: 0, // best-effort; not in metrics snapshot
        });
        if ("text" in narration) {
          return { ...actionOk("Sprint completed"), narrative: narration.text };
        }
        if ("error" in narration) {
          // Sidecar offline: return ok but with warning; sprint close not blocked
          return { ...actionOk("Sprint completed"), narrativeError: "Narrative unavailable: sidecar offline" };
        }
      }

      return actionOk("Sprint completed");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },
};

async function ensureProject(locals: App.Locals, id: string): Promise<void> {
  const { em, ctx } = await requestProjectScope(locals, id);
  const project = await loadProjectOverview(em, ctx, id);
  if (!project) throw error(404, "Project not found");
}
