import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { deleteWorkItem, updateWorkItem } from "@work-management/interface/work-item-actions.ts";
import { getWorkItem, listChildWorkItems } from "@work-management/interface/work-item-detail.ts";
import {
  dispatchDependencyRunForTasks,
  previewDependencyRunForTasks,
} from "@execution-orchestration/interface/dependency-run-actions.ts";
import {
  loadDependencyRunLiveFeedbackForTasks,
} from "@execution-orchestration/interface/dependency-run-live-feedback.ts";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
        try {
          const task = await getWorkItem(em, ctx, params.id);
          const children = await listChildWorkItems(em, ctx, params.id);
          return { task, children };
        } catch (err) {
          if ((err as Error).message.includes("not found")) throw error(404, "Task not found");
          throw err;
        }
      })(),
    },
  };
};

const UpdateDescriptionSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  description: v.union([v.string(), v.null_()]),
});

const UpdateFieldSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  status: v.optional(v.picklist(["pending", "in_progress", "blocked", "completed", "cancelled"])),
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20))),
  description: v.optional(v.union([v.string(), v.null_()])),
});

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) {
    out[k] = typeof vRaw === "string" ? vRaw : null;
  }
  return out;
}

export const actions: Actions = {
  update: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, id: params.id };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(UpdateFieldSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    try {
      const { id: _id, ...input } = parsed.output;
      await updateWorkItem(em, ctx, params.id, input);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async ({ params, locals }) => {
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    await deleteWorkItem(em, ctx, params.id);
    return actionOk("Task deleted");
  },

  autosave: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate = { id: params.id, description: raw["description"] ?? null };
    const parsed = v.safeParse(UpdateDescriptionSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    try {
      await updateWorkItem(
        em,
        ctx,
        params.id,
        { description: parsed.output.description },
      );
      return actionOk("Saved");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  runPreview: async (event) => {
    const { request, params, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const projectId = locals?.activeProjectId ?? null;
      const workflowApi = projectId ? createWebWorkflowApiCaller(event) : null;
      if (workflowApi) {
        const preview = await workflowApi.tasks.previewDependencyRun({
          projectId,
          mode: "task",
          targetTaskIds: [params.id],
          traceId: raw["traceId"] ?? undefined,
        });
        return { ok: true, mode: "runPreview", preview };
      }
      const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null, params.id);
      const preview = await previewDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [params.id],
        traceId: raw["traceId"] ?? undefined,
      });
      return { ok: true, mode: "runPreview", preview };
    } catch (err) {
      return fail(400, { ok: false, mode: "runPreview", message: (err as Error).message });
    }
  },

  run: async (event) => {
    const { request, params, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const agent = raw["agent"]?.trim() || "codex";
    try {
      const projectId = locals?.activeProjectId ?? null;
      const workflowApi = projectId ? createWebWorkflowApiCaller(event) : null;
      if (workflowApi) {
        const dispatch = await workflowApi.tasks.dispatchDependencyRun({
          ...workflowApiProjectMetadata(event, projectId),
          mode: "task",
          targetTaskIds: [params.id],
          traceId: raw["traceId"] ?? undefined,
          agent,
          model: raw["model"] ?? undefined,
          prompt: raw["prompt"] ?? undefined,
        });
        return { ok: true, mode: "run", dispatch };
      }
      const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null, params.id);
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
        mode: "task",
        targetTaskIds: [params.id],
        traceId: raw["traceId"] ?? undefined,
        agent,
        model: raw["model"] ?? undefined,
        prompt: raw["prompt"] ?? undefined,
      });
      return { ok: true, mode: "run", dispatch };
    } catch (err) {
      return fail(400, { ok: false, mode: "run", message: (err as Error).message });
    }
  },

  runFeedback: async (event) => {
    const { request, params, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const projectId = locals?.activeProjectId ?? null;
      const workflowApi = projectId ? createWebWorkflowApiCaller(event) : null;
      if (workflowApi) {
        const feedback = await workflowApi.tasks.dependencyRunLiveFeedback({
          projectId,
          traceId: raw["traceId"] ?? undefined,
          runGroupId: raw["runGroupId"] ?? undefined,
          runId: raw["runId"] ?? undefined,
          taskId: params.id,
        });
        return { ok: true, mode: "runFeedback", feedback };
      }
      const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null, params.id);
      const feedback = await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
        traceId: raw["traceId"] ?? undefined,
        runGroupId: raw["runGroupId"] ?? undefined,
        runId: raw["runId"] ?? undefined,
        taskId: params.id,
      });
      return { ok: true, mode: "runFeedback", feedback };
    } catch (err) {
      return fail(400, { ok: false, mode: "runFeedback", message: (err as Error).message });
    }
  },

  logTime: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const durationMinutes = Number(fd.get("durationMinutes") ?? 0);
    const loggedDate = String(fd.get("loggedDate") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim() || null;
    if (!durationMinutes || durationMinutes < 1 || !loggedDate) {
      return fail(400, actionFail("Duration and date are required"));
    }
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    const { TimeEntry } = await import("@work-management/infrastructure/database/entities/tasks/TimeEntry.ts");
    const { Org } = await import("@identity-access/infrastructure/database/entities/auth/Org.ts");
    const { Task } = await import("@work-management/infrastructure/database/entities/tasks/Task.ts");
    const entry = em.create(TimeEntry, {
      org: { id: ctx.orgId } as InstanceType<typeof Org>,
      task: { id: params.id } as InstanceType<typeof Task>,
      userId: ctx.userId,
      durationMinutes,
      description,
      loggedDate,
    });
    await em.save(entry);
    return actionOk(`Logged ${durationMinutes} min`);
  },
};
