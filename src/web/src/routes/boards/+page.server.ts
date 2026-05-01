import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { listBoardTasks } from "$lib/product-queries";
import { openProductDb } from "$lib/server/db";
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  moveTaskStatusAction,
} from "$lib/server/tasks";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "$lib/server/boards.schema";
import { actionOk, actionFail } from "$lib/feedback/action-result";

// Inherit `activeProjectId` from the root layout-data so the optional
// project scoping is consistent with `/projects` and `/docs`. Tests for the
// route load do not always supply `parent`; guard for legacy callers.
export const load: PageServerLoad = async ({ url, parent }) => {
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const project = url.searchParams.get("project") ?? parentData.activeProjectId ?? "";
  return {
    project,
    activeProjectId: parentData.activeProjectId ?? null,
    streamed: {
      data: (async () => ({ tasks: await listBoardTasks(project || null) }))(),
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

async function defaultOrgId(db: Awaited<ReturnType<typeof openProductDb>>): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  return rows[0]?.id ?? null;
}

export const actions: Actions = {
  create: async ({ request }) => {
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
    const db = await openProductDb();
    try {
      const orgId = await defaultOrgId(db);
      if (!orgId) return fail(500, actionFail("no-org"));
      const created = await createTaskAction(db, {
        orgId,
        projectId: parsed.output.projectId ?? null,
        title: parsed.output.title,
        status: parsed.output.status,
      });
      void created;
      return actionOk("Task created");
    } finally {
      await db.close();
    }
  },

  update: async ({ request }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw };
    if ("priority" in candidate && candidate["priority"] !== null && candidate["priority"] !== undefined) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await updateTaskAction(db, parsed.output);
      return actionOk("Task updated");
    } catch (err) {
      return fail(400, actionFail((err as Error).message));
    } finally {
      await db.close();
    }
  },

  delete: async ({ request }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardDeleteSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await deleteTaskAction(db, parsed.output.id);
      return actionOk("Task deleted");
    } finally {
      await db.close();
    }
  },

  move: async ({ request }) => {
    const fd = await request.formData();
    const parsed = v.safeParse(BoardMoveSchema, fdToRecord(fd));
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openProductDb();
    try {
      await moveTaskStatusAction(db, parsed.output);
      return actionOk("Task moved");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("status conflict")) return fail(409, actionFail(msg));
      return fail(400, actionFail(msg));
    } finally {
      await db.close();
    }
  },
};
