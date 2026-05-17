import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  createWorkItem,
  deleteWorkItem,
  updateWorkItem,
} from "@work-management/interface/work-item-actions.ts";
import { listBoardWorkItems } from "@work-management/interface/work-item-detail.ts";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "$lib/server/boards.schema";
import { BulkStatusSchema, BulkDeleteSchema } from "$lib/server/task-bulk.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { requestServiceScope } from "$lib/server/request-service-scope";

// Inherit `activeProjectId` from the root layout-data so the optional
// project scoping is consistent with `/projects` and `/docs`. Tests for the
// route load do not always supply `parent`; guard for legacy callers.
export const load: PageServerLoad = async ({ url, parent, locals }) => {
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const projectKey = url.searchParams.get("project") ?? parentData.activeProjectId ?? "";
  const { em, ctx } = await requestServiceScope(locals, projectKey || null);
  const project = ctx.projectId ?? "";
  return {
    project,
    activeProjectId: parentData.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        return { tasks: await listBoardWorkItems(em, ctx) };
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
  create: async ({ request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const priorityFromFd = fd.get("priority");
    const candidate: Record<string, unknown> = { ...raw };
    if ("projectId" in candidate && candidate["projectId"] === "") {
      candidate["projectId"] = null;
    }
    if (priorityFromFd != null) candidate["priority"] = Number(priorityFromFd);
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, parsed.output.projectId ?? null);
    const created = await createWorkItem(em, ctx, {
      title: parsed.output.title,
      status: parsed.output.status,
    });
    void created;
    return actionOk("Task created");
  },

  update: async ({ request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if ("priority" in candidate && candidate["priority"] !== null && candidate["priority"] !== undefined) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    try {
      const { id, ...input } = parsed.output;
      await updateWorkItem(em, ctx, id, input);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async ({ request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    await deleteWorkItem(em, ctx, parsed.output.id);
    return actionOk("Task deleted");
  },

  bulkStatus: async ({ request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BulkStatusSchema, raw);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const ids = parsed.output.ids.split(",").filter(Boolean);
    if (ids.length === 0) return fail(400, actionFail("no ids"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    const result = await bulkUpdateWorkItems(em, ctx, ids, { status: parsed.output.status });
    return actionOk(`${result.updated} task(s) updated`);
  },

  bulkDelete: async ({ request, locals }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BulkDeleteSchema, raw);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const ids = parsed.output.ids.split(",").filter(Boolean);
    if (ids.length === 0) return fail(400, actionFail("no ids"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    const result = await bulkDeleteWorkItems(em, ctx, ids);
    return actionOk(`${result.deleted} task(s) deleted`);
  },

  move: async ({ request, locals }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
    try {
      await updateWorkItem(em, ctx, parsed.output.id, {
        expectedStatus: parsed.output.from,
        status: parsed.output.to,
      });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    }
  },
};
