import { fail } from "@sveltejs/kit";
import * as v from "valibot";
import type { Actions, PageServerLoad } from "./$types";
import { listBoardTasks } from "../../../../lib/product-queries";
import { openDatabase } from "../../../../lib/server/db";
import {
  createTaskAction,
  deleteTaskAction,
  moveTaskStatusAction,
  updateTaskAction,
} from "../../../../lib/server/tasks";
import {
  BoardCreateSchema,
  BoardDeleteSchema,
  BoardMoveSchema,
  BoardUpdateSchema,
} from "../../../../lib/server/boards.schema";
import { actionFail, actionOk } from "../../../../lib/feedback/action-result";

export const load: PageServerLoad = async ({ params, url }) => {
  const projectId = params.id;
  const sprintFilter = url.searchParams.get("sprint")?.trim() ?? "";
  return {
    projectId,
    sprintFilter,
    streamed: {
      data: (async () => ({ tasks: await listBoardTasks(projectId) }))(),
    },
  };
};

function fdToRecord(fd: FormData): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, vRaw] of fd.entries()) out[k] = typeof vRaw === "string" ? vRaw : null;
  return out;
}

async function defaultOrgId(db: Awaited<ReturnType<typeof openDatabase>>): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  return rows[0]?.id ?? null;
}

export const actions: Actions = {
  create: async ({ params, request }) => {
    const fd = await request.formData();
    const raw = fdToRecord(fd);
    const candidate: Record<string, unknown> = { ...raw, projectId: params.id };
    const parsed = v.safeParse(BoardCreateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openDatabase();
    try {
      const orgId = await defaultOrgId(db);
      if (!orgId) return fail(500, actionFail("no-org"));
      await createTaskAction(db, {
        orgId,
        projectId: params.id ?? parsed.output.projectId ?? null,
        title: parsed.output.title,
        status: parsed.output.status,
      });
      return actionOk("Task created");
    } finally {
      await db.close();
    }
  },

  update: async ({ request }) => {
    const fd = await request.formData();
    const candidate: Record<string, unknown> = { ...fdToRecord(fd) };
    if ("priority" in candidate && candidate["priority"] !== null) {
      candidate["priority"] = Number(candidate["priority"]);
    }
    if (candidate["description"] === "") candidate["description"] = null;
    const parsed = v.safeParse(BoardUpdateSchema, candidate);
    if (!parsed.success) return fail(400, actionFail("invalid input"));
    const db = await openDatabase();
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
    const db = await openDatabase();
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
    const db = await openDatabase();
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
