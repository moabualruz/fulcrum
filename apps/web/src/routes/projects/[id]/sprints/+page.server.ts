import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import {
  CreateSprintSchema,
  StartSprintSchema,
  CompleteSprintSchema,
} from "$lib/server/sprints.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { generateNarration } from "$lib/server/reports";
import { isFeatureEnabled } from "$lib/server/feature-flags";
import { createProjectApiForEvent } from "$lib/server/project-api";
import { createSprintApiForEvent } from "$lib/server/sprint-api";

type SprintBoard = { sprints: unknown[]; velocity: unknown[] };

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  await ensureProject(event, projectId);
  return {
    projectId,
    streamed: {
      // Streamed so the page shell renders before the sprint board resolves.
      data: (async () =>
        (await createSprintApiForEvent(event).sprints.loadProjectSprints({
          projectId,
        })) as SprintBoard)(),
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
  createSprint: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if (candidate["capacity"]) candidate["capacity"] = Number(candidate["capacity"]);
    const parsed = v.safeParse(CreateSprintSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      await createSprintApiForEvent(event).sprints.createProjectSprint({
        projectId: event.params.id,
        name: parsed.output.name,
        goal: parsed.output.goal,
        capacity: parsed.output.capacity,
      });
      return actionOk("Sprint created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  startSprint: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(StartSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      await createSprintApiForEvent(event).sprints.startProjectSprint({ id: parsed.output.id });
      return actionOk("Sprint started");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  completeSprint: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(CompleteSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const result = (await createSprintApiForEvent(event).sprints.completeProjectSprint({
        id: parsed.output.id,
      })) as { id: string; metrics: { velocity: number; completed_tasks: number } };
      const sprintId = result.id;
      const metrics = result.metrics;

      // LLM narrative step: gated behind FULCRUM_FEATURES=report-llm-narration
      const llmEnabled = isFeatureEnabled("report-llm-narration");
      if (llmEnabled) {
        const narration = await generateNarration({
          projectId: event.params.id,
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

async function ensureProject(event: RequestEvent, id: string): Promise<void> {
  try {
    await createProjectApiForEvent(event).projects.overview({ id });
  } catch {
    throw error(404, "Project not found");
  }
}
