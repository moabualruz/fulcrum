import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "../../../../lib/server/boards.schema";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";
import { createTaskApiForEvent } from "$lib/server/task-api";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

type ManualTaskWorkbenchViewMode = "board" | "list" | "table";
type TaskStateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

const TASK_STATE_GROUP_ORDER: readonly TaskStateGroup[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
];

export const load: PageServerLoad = async (event) => {
  const { params, url } = event;
  const projectId = params.id;
  const sprintFilter = url.searchParams.get("sprint")?.trim() ?? "";
  return {
    projectId,
    sprintFilter,
    streamed: {
      data: (async () => {
        const taskApi = createTaskApiForEvent(event);
        const [tasks, manualWorkbench] = await Promise.all([
          taskApi.tasks.list({ projectId }),
          taskApi.tasks.manualWorkbench({
            projectId,
            traceId: url.searchParams.get("trace")?.trim() || undefined,
            viewMode: viewModeParam(url.searchParams.get("view")),
            filters: {
              statuses: csvParam(url.searchParams.get("status")),
              stateGroups: stateGroupParam(url.searchParams.get("stateGroup")),
              labels: csvParam(url.searchParams.get("label") ?? url.searchParams.get("labels")),
              assigneeIds: csvParam(url.searchParams.get("assignee")),
              cycleIds: csvParam(url.searchParams.get("cycle")),
              moduleIds: csvParam(url.searchParams.get("module")),
              taskTypes: csvParam(url.searchParams.get("taskType")),
              priorities: numberParam(url.searchParams.get("priority")),
              search: url.searchParams.get("search")?.trim() || undefined,
            },
            projectCapabilities: { estimateEnabled: false },
          }),
        ]);
        return { tasks, manualWorkbench };
      })(),
    },
  };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) out[k] = typeof vRaw === "string" ? vRaw : null;
  return out;
}

function csvIds(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

function csvParam(value: string | null | undefined): string[] | undefined {
  const values = csvIds(value);
  return values.length ? values : undefined;
}

function numberParam(value: string | null | undefined): number[] | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? [parsed] : undefined;
}

function viewModeParam(value: string | null | undefined): ManualTaskWorkbenchViewMode | undefined {
  if (value === "board" || value === "list" || value === "table") return value;
  return undefined;
}

function stateGroupParam(value: string | null | undefined): TaskStateGroup[] | undefined {
  const groups = csvIds(value).filter((group): group is TaskStateGroup =>
    (TASK_STATE_GROUP_ORDER as readonly string[]).includes(group)
  );
  return groups.length ? groups : undefined;
}

export const actions: Actions = {
  create: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, projectId: event.params.id };
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      await createTaskApiForEvent(event).tasks.create({
        projectId: event.params.id,
        title: parsed.output.title,
        status: parsed.output.status,
      });
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  update: async (event) => {
    const fd = await event.request.formData();
    const candidate: Record<string, unknown> = { ...fdToRecord(fd) };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { id, ...patch } = parsed.output;
      await createTaskApiForEvent(event).tasks.update({
        id,
        projectId: event.params.id,
        ...patch,
      });
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    await createTaskApiForEvent(event).tasks.delete({
      id: parsed.output.id,
      projectId: event.params.id,
    });
    return actionOk("Task deleted");
  },

  move: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      await createTaskApiForEvent(event).tasks.update({
        id: parsed.output.id,
        projectId: event.params.id,
        status: parsed.output.to,
      });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    }
  },

  runPreview: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const taskIds = csvIds(raw["taskIds"] ?? raw["taskId"] ?? raw["id"]);
    if (taskIds.length === 0) return fail(400, { ok: false, mode: "runPreview", message: "taskIds is required" });
    try {
      const preview = await workflowApi(event).tasks.previewDependencyRun({
        ...workflowApiProjectMetadata(event, event.params.id),
        projectId: event.params.id,
        mode: taskIds.length > 1 ? "board" : "task",
        targetTaskIds: taskIds,
        traceId: raw["traceId"] ?? undefined,
      });
      return { ok: true, mode: "runPreview", preview };
    } catch (err) {
      return fail(400, { ok: false, mode: "runPreview", message: (err as Error).message });
    }
  },

  run: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const taskIds = csvIds(raw["taskIds"] ?? raw["taskId"] ?? raw["id"]);
    if (taskIds.length === 0) return fail(400, { ok: false, mode: "run", message: "taskIds is required" });
    const agent = raw["agent"]?.trim() || "codex";
    try {
      const dispatch = await workflowApi(event).tasks.dispatchDependencyRun({
        ...workflowApiProjectMetadata(event, event.params.id),
        mode: taskIds.length > 1 ? "board" : "task",
        targetTaskIds: taskIds,
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

  qaReview: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const taskId = raw["taskId"] ?? raw["id"];
    if (!taskId) return fail(400, { ok: false, mode: "qaReview", message: "taskId is required" });
    const reviewText = raw["reviewText"];
    if (!reviewText) return fail(400, { ok: false, mode: "qaReview", message: "reviewText is required" });
    try {
      const review = await workflowApi(event).tasks.recordQaReview({
        ...workflowApiProjectMetadata(event, event.params.id),
        taskId,
        runId: raw["runId"] ?? raw["run"] ?? undefined,
        traceId: raw["traceId"] ?? undefined,
        reviewType: raw["reviewType"] === "plan" || raw["reviewType"] === "spec" ? raw["reviewType"] : "code",
        reviewerAgent: raw["reviewerAgent"] ?? undefined,
        feedbackAgent: raw["feedbackAgent"] ?? undefined,
        feedbackModel: raw["feedbackModel"] ?? undefined,
        reviewText,
      });
      return { ok: true, mode: "qaReview", review };
    } catch (err) {
      return fail(400, { ok: false, mode: "qaReview", message: (err as Error).message });
    }
  },
};

function workflowApi(event: Parameters<typeof createWebWorkflowApiCaller>[0]) {
  const api = createWebWorkflowApiCaller(event);
  if (!api) throw new Error("Workflow public API is not configured.");
  return api;
}
