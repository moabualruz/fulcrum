import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  buildProjectTaskWorkbench,
  createProjectBoardWorkItem,
  deleteProjectBoardWorkItem,
  listProjectBoardWorkItems,
  TASK_STATE_GROUP_ORDER,
  type ManualTaskWorkbenchViewMode,
  type TaskStateGroup,
  updateProjectBoardWorkItem,
} from "@work-management/interface/project-board.ts";
import {
  dispatchDependencyRunForTasks,
  previewDependencyRunForTasks,
} from "@execution-orchestration/interface/dependency-run-actions.ts";
import { recordTaskQaReview } from "@execution-orchestration/interface/task-run-reviews.ts";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "../../../../lib/server/boards.schema";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { createWebWorkflowApiCaller, workflowApiProjectMetadata } from "$lib/server/workflow-api";

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const projectId = params.id;
  const sprintFilter = url.searchParams.get("sprint")?.trim() ?? "";
  return {
    projectId,
    sprintFilter,
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestServiceScope(locals, projectId);
        return {
          tasks: await listProjectBoardWorkItems(em, ctx),
          manualWorkbench: await buildProjectTaskWorkbench(em, ctx, {
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
        };
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
  create: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, projectId: params.id };
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id);
      await createProjectBoardWorkItem(em, ctx, {
        title: parsed.output.title,
        status: parsed.output.status,
      });
      return actionOk("Task created");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  update: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const candidate: Record<string, unknown> = { ...fdToRecord(fd) };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id, parsed.output.id);
      const { id, ...patch } = parsed.output;
      await updateProjectBoardWorkItem(em, ctx, id, patch);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, params.id, parsed.output.id);
    await deleteProjectBoardWorkItem(em, ctx, parsed.output.id);
    return actionOk("Task deleted");
  },

  move: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { em, ctx } = await requestServiceScope(locals, params.id, parsed.output.id);
      await updateProjectBoardWorkItem(em, ctx, parsed.output.id, { status: parsed.output.to });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    }
  },

  runPreview: async (event) => {
    const { params, request, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const taskIds = csvIds(raw["taskIds"] ?? raw["taskId"] ?? raw["id"]);
    if (taskIds.length === 0) return fail(400, { ok: false, mode: "runPreview", message: "taskIds is required" });
    try {
      const workflowApi = createWebWorkflowApiCaller(event);
      if (workflowApi) {
        const preview = await workflowApi.tasks.previewDependencyRun({
          projectId: params.id,
          mode: taskIds.length > 1 ? "board" : "task",
          targetTaskIds: taskIds,
          traceId: raw["traceId"] ?? undefined,
        });
        return { ok: true, mode: "runPreview", preview };
      }
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const preview = await previewDependencyRunForTasks(em, ctx, {
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
    const { params, request, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const taskIds = csvIds(raw["taskIds"] ?? raw["taskId"] ?? raw["id"]);
    if (taskIds.length === 0) return fail(400, { ok: false, mode: "run", message: "taskIds is required" });
    const agent = raw["agent"]?.trim() || "codex";
    try {
      const workflowApi = createWebWorkflowApiCaller(event);
      if (workflowApi) {
        const dispatch = await workflowApi.tasks.dispatchDependencyRun({
          ...workflowApiProjectMetadata(event, params.id),
          mode: taskIds.length > 1 ? "board" : "task",
          targetTaskIds: taskIds,
          traceId: raw["traceId"] ?? undefined,
          agent,
          model: raw["model"] ?? undefined,
          prompt: raw["prompt"] ?? undefined,
        });
        return { ok: true, mode: "run", dispatch };
      }
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const dispatch = await dispatchDependencyRunForTasks(em, ctx, {
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
    const { params, request, locals } = event;
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const taskId = raw["taskId"] ?? raw["id"];
    if (!taskId) return fail(400, { ok: false, mode: "qaReview", message: "taskId is required" });
    const reviewText = raw["reviewText"];
    if (!reviewText) return fail(400, { ok: false, mode: "qaReview", message: "reviewText is required" });
    try {
      const workflowApi = createWebWorkflowApiCaller(event);
      if (workflowApi) {
        const review = await workflowApi.tasks.recordQaReview({
          ...workflowApiProjectMetadata(event, params.id),
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
      }
      const { em, ctx } = await requestServiceScope(locals, params.id);
      const review = await recordTaskQaReview(em, ctx, {
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
