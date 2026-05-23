import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "$lib/server/boards.schema";
import { BulkStatusSchema, BulkDeleteSchema } from "$lib/server/task-bulk.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";
import { createWorkspaceBoardApiForEvent } from "$lib/server/workspace-board-api";

// Inherit `activeProjectId` from the root layout-data so the optional
// project scoping is consistent with `/projects` and `/docs`. Tests for the
// route load do not always supply `parent`; guard for legacy callers.
export const load: PageServerLoad = async (event) => {
  const parentData =
    typeof event.parent === "function"
      ? await event.parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const projectKey = event.url.searchParams.get("project") ?? parentData.activeProjectId ?? "";
  const api = createWorkspaceBoardApiForEvent(event);
  return {
    project: projectKey,
    activeProjectId: parentData.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        return { tasks: await api.tasks.board.list({ projectId: projectKey || null }) };
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
  create: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const priorityFromFd = fd.get("priority");
    const candidate: Record<string, unknown> = { ...raw };
    if ("projectId" in candidate && candidate["projectId"] === "") {
      candidate["projectId"] = null;
    }
    if (priorityFromFd != null) candidate["priority"] = Number(priorityFromFd);
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const api = createWorkspaceBoardApiForEvent(event);
    await api.tasks.board.create({
      title: parsed.output.title,
      status: parsed.output.status,
      projectId: parsed.output.projectId ?? null,
    });
    return actionOk("Task created");
  },

  update: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if ("priority" in candidate && candidate["priority"] !== null && candidate["priority"] !== undefined) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const { id, ...input } = parsed.output;
      const api = createWorkspaceBoardApiForEvent(event);
      await api.tasks.board.update({ id, ...input, projectId: event.locals?.activeProjectId ?? null });
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    }
  },

  delete: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const api = createWorkspaceBoardApiForEvent(event);
    await api.tasks.board.delete({ id: parsed.output.id, projectId: event.locals?.activeProjectId ?? null });
    return actionOk("Task deleted");
  },

  bulkStatus: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BulkStatusSchema, raw);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const ids = parsed.output.ids.split(",").filter(Boolean);
    if (ids.length === 0) return fail(400, actionFail("no ids"));
    const api = createWorkspaceBoardApiForEvent(event);
    const result = await api.tasks.board.bulkStatus({
      ids,
      status: parsed.output.status,
      projectId: event.locals?.activeProjectId ?? null,
    }) as { updated: number };
    return actionOk(`${result.updated} task(s) updated`);
  },

  bulkDelete: async (event) => {
    const fd = await event.request.formData();
    const raw = fdToRecord(fd);
    const parsed = v.safeParse(BulkDeleteSchema, raw);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const ids = parsed.output.ids.split(",").filter(Boolean);
    if (ids.length === 0) return fail(400, actionFail("no ids"));
    const api = createWorkspaceBoardApiForEvent(event);
    const result = await api.tasks.board.bulkDelete({
      ids,
      projectId: event.locals?.activeProjectId ?? null,
    }) as { deleted: number };
    return actionOk(`${result.deleted} task(s) deleted`);
  },

  move: async (event) => {
    const fd = await event.request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    try {
      const api = createWorkspaceBoardApiForEvent(event);
      await api.tasks.board.move({
        id: parsed.output.id,
        expectedStatus: parsed.output.from,
        status: parsed.output.to,
        projectId: event.locals?.activeProjectId ?? null,
      });
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    }
  },
};
