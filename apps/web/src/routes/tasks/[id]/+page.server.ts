import { error, fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";
import { createTaskDetailApiForEvent } from "$lib/server/task-detail-api";

export const load: PageServerLoad = (event) => {
  const { params } = event;
  return {
    streamed: {
      data: (async () => {
        try {
          const taskApi = createTaskDetailApiForEvent(event);
          const task = await taskApi.tasks.get({ id: params.id });
          const children = await taskApi.tasks.listChildren({ id: params.id });
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
  update: async (event) => {
    const { request, params } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, id: params.id };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(UpdateFieldSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { id: _id, ...input } = parsed.output;
      await createTaskDetailApiForEvent(event).tasks.update({ id: params.id, ...input });
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async (event) => {
    await createTaskDetailApiForEvent(event).tasks.delete({ id: event.params.id });
    return actionOk("Task deleted");
  },

  autosave: async (event) => {
    const { request, params } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate = { id: params.id, description: raw["description"] ?? null };
    const parsed = v.safeParse(UpdateDescriptionSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      await createTaskDetailApiForEvent(event).tasks.update({ id: params.id, description: parsed.output.description });
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
      const workflowApi = createWebWorkflowApiCaller(event);
      if (!workflowApi || !projectId) {
        return fail(400, { ok: false, mode: "runPreview", message: "Workflow public API is not configured" });
      }
      const preview = await workflowApi.tasks.previewDependencyRun({
        projectId,
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
      const workflowApi = createWebWorkflowApiCaller(event);
      if (!workflowApi || !projectId) {
        return fail(400, { ok: false, mode: "run", message: "Workflow public API is not configured" });
      }
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
      const workflowApi = createWebWorkflowApiCaller(event);
      if (!workflowApi || !projectId) {
        return fail(400, { ok: false, mode: "runFeedback", message: "Workflow public API is not configured" });
      }
      const feedback = await workflowApi.tasks.dependencyRunLiveFeedback({
        projectId,
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

  startAiAssistSession: async (event) => {
    const { request, params } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    try {
      const task = await createTaskDetailApiForEvent(event).tasks.get({ id: params.id });
      return {
        ok: true,
        mode: "startAiAssistSession",
        session: startTaskAiAssistSession({
          task,
          agent: raw["agent"],
          route: raw["route"],
          workspacePath: raw["workspacePath"],
        }),
      };
    } catch (err) {
      return fail(400, {
        ok: false,
        mode: "startAiAssistSession",
        message: (err as Error).message,
      });
    }
  },

  logTime: async (event) => {
    const { request, params } = event;
    const fd = await request.formData();
    const durationMinutes = Number(fd.get("durationMinutes") ?? 0);
    const loggedDate = String(fd.get("loggedDate") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim() || null;
    if (!durationMinutes || durationMinutes < 1 || !loggedDate) {
      return fail(400, actionFail("Duration and date are required"));
    }
    const workflowApi = createWebWorkflowApiCaller(event);
    await workflowApi.timeEntries.log({
      taskId: params.id,
      durationMinutes,
      loggedDate,
      description: description ?? undefined,
    });
    return actionOk(`Logged ${durationMinutes} min`);
  },
};
