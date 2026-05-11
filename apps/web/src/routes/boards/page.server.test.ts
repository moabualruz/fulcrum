import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createProject } from "@/application/projects/commands.ts";
import { createTask } from "@/application/tasks/commands.ts";
import { initDatabase, closeDatabase } from "$lib/server/db";

interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// `+page.server.ts` opens `${productDbDir()}/main`, which honours
// `FULCRUM_HOME`. Seed three tasks across two projects so the project
// filter and event emissions can be asserted.

let scratch: string;

interface BoardPayload {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    project_id: string | null;
    updated_at: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-boards-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  await closeDatabase();
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

interface SeededIds {
  orgId: string;
  alphaProjectId: string;
  betaProjectId: string;
  taskAlphaPendingId: string;
  taskAlphaInProgressId: string;
  taskBetaPendingId: string;
}

async function seedTasks(): Promise<SeededIds> {
  const db = await initDatabase();
  const org = (await db.query<{ id: string }>("SELECT id FROM orgs ORDER BY created_at ASC LIMIT 1"))[0]!;
  const ctx = { orgId: org.id, userId: "test-user", projectId: null };
  const em = db.em.fork();
  const alpha = await createProject(em, ctx, { slug: "alpha", name: "Alpha" });
  const beta = await createProject(em, ctx, { slug: "beta", name: "Beta" });
  const taskAlphaPending = await createTask(em, {
    ...ctx,
    projectId: alpha.id,
  }, {
    title: "Alpha pending",
    status: "pending",
  });
  const taskAlphaInProgress = await createTask(em, {
    ...ctx,
    projectId: alpha.id,
  }, {
    title: "Alpha in_progress",
    status: "in_progress",
  });
  const taskBetaPending = await createTask(em, {
    ...ctx,
    projectId: beta.id,
  }, {
    title: "Beta pending",
    status: "pending",
  });
  return {
    orgId: org.id,
    alphaProjectId: alpha.id,
    betaProjectId: beta.id,
    taskAlphaPendingId: taskAlphaPending.id,
    taskAlphaInProgressId: taskAlphaInProgress.id,
    taskBetaPendingId: taskBetaPending.id,
  };
}

function fakeLoadEvent(searchParams: Record<string, string>): Parameters<
  typeof import("./+page.server.ts").load
>[0] {
  const url = new URL("http://localhost/boards");
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return {
    url,
    locals: { activeProjectId: null },
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

interface FailResult {
  status?: number;
  data?: Record<string, unknown>;
}

describe("/boards +page.server.ts load()", () => {
  test("default load returns all seeded tasks across both projects, project=''", async () => {
    const ids = await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(fakeLoadEvent({}));
    expect(result.project).toBe("");
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<BoardPayload>(result);
    expect(Array.isArray(payload.tasks)).toBe(true);
    expect(payload.tasks).toHaveLength(3);
    const seen = new Set(payload.tasks.map((t) => t.id));
    expect(seen.has(ids.taskAlphaPendingId)).toBe(true);
    expect(seen.has(ids.taskAlphaInProgressId)).toBe(true);
    expect(seen.has(ids.taskBetaPendingId)).toBe(true);
  });

  test("project search-param narrows tasks to that project", async () => {
    const ids = await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(
      fakeLoadEvent({ project: ids.alphaProjectId }),
    );
    expect(result.project).toBe(ids.alphaProjectId);
    const payload = await streamedData<BoardPayload>(result);
    expect(payload.tasks).toHaveLength(2);
    for (const t of payload.tasks) {
      expect(t.project_id).toBe(ids.alphaProjectId);
    }
  });
});

describe("/boards +page.server.ts actions", () => {
  test("create action inserts the row and emits task.created", async () => {
    await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("title", "Brand new task");
    fd.set("status", "pending");
    const request = new Request("http://localhost/boards?/create", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.create({ request } as Parameters<
      typeof mod.actions.create
    >[0]);
    // happy-path returns success (no `fail`); shape may include `{ok:true}`.
    expect(result).toBeDefined();
    expect((result as { status?: number }).status ?? 200).toBeLessThan(400);

    const db = await initDatabase();
    const rows = await db.query<{ id: string; title: string }>(
      `SELECT id, title FROM tasks WHERE title = $1`,
      ["Brand new task"],
    );
    expect(rows).toHaveLength(1);
    const events = await db.query<EventRow>(
      `SELECT * FROM events WHERE subject_kind = 'task' AND subject_id = $1`,
      [rows[0]!.id],
    );
    expect(events.find((e) => e.verb === "created")).toBeDefined();
  });

  test("move action updates status and emits task.status_changed", async () => {
    const ids = await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("id", ids.taskAlphaPendingId);
    fd.set("from", "pending");
    fd.set("to", "in_progress");
    const request = new Request("http://localhost/boards?/move", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.move({ request } as Parameters<
      typeof mod.actions.move
    >[0]);
    expect((result as { status?: number }).status ?? 200).toBeLessThan(400);

    const db = await initDatabase();
    const rows = await db.query<{ status: string }>(
      `SELECT status FROM tasks WHERE id = $1`,
      [ids.taskAlphaPendingId],
    );
    expect(rows[0]?.status).toBe("in_progress");
    const events = await db.query<EventRow>(
      `SELECT * FROM events WHERE subject_kind = 'task' AND subject_id = $1 AND verb = 'status_changed'`,
      [ids.taskAlphaPendingId],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      from: "pending",
      to: "in_progress",
      task: ids.taskAlphaPendingId,
    });
  });

  test("move action with stale `from` returns fail(409, …)", async () => {
    const ids = await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const fd = new FormData();
    // Real status is `pending`; supply `blocked` to simulate a race.
    fd.set("id", ids.taskAlphaPendingId);
    fd.set("from", "blocked");
    fd.set("to", "completed");
    const request = new Request("http://localhost/boards?/move", {
      method: "POST",
      body: fd,
    });
    const result = (await mod.actions.move({ request } as Parameters<
      typeof mod.actions.move
    >[0])) as FailResult;
    expect(result.status).toBe(409);
  });
});
