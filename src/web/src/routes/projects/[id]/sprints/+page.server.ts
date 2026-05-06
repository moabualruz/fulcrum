import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { listSprints, getSprintVelocity } from "$lib/product-queries";
import {
  createSprintAction,
  startSprintAction,
  completeSprintAction,
} from "$lib/server/sprints";
import {
  CreateSprintSchema,
  StartSprintSchema,
  CompleteSprintSchema,
} from "$lib/server/sprints.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { generateNarration } from "$lib/server/reports";
import { isFeatureEnabled } from "$lib/server/feature-flags";

export const load: PageServerLoad = async ({ params }) => {
  const projectId = params.id;
  return {
    projectId,
    streamed: {
      data: (async () => {
        const [sprints, velocity] = await Promise.all([
          listSprints(projectId),
          getSprintVelocity(projectId),
        ]);
        return { sprints, velocity };
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
  createSprint: async ({ request, params }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if (candidate["capacity"]) candidate["capacity"] = Number(candidate["capacity"]);
    const parsed = v.safeParse(CreateSprintSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      await createSprintAction(db, {
        orgId,
        projectId: params.id,
        name: parsed.output.name,
        goal: parsed.output.goal,
        capacity: parsed.output.capacity,
      });
      return actionOk("Sprint created");
    } finally {
      await db.close();
    }
  },

  startSprint: async ({ request }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(StartSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openDatabase();
    try {
      await startSprintAction(db, parsed.output.id);
      return actionOk("Sprint started");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },

  completeSprint: async ({ request, params }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(CompleteSprintSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openDatabase();
    try {
      const { id: sprintId, metrics } = await completeSprintAction(db, parsed.output.id);

      // LLM narrative step — gated behind FULCRUM_FEATURES=report-llm-narration
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
          // Sidecar offline — return ok but with warning; sprint close not blocked
          return { ...actionOk("Sprint completed"), narrativeError: "Narrative unavailable — sidecar offline" };
        }
      }

      return actionOk("Sprint completed");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },
};
