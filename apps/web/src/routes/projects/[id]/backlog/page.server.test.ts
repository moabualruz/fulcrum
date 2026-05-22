import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// `/projects/[id]/backlog/+page.server.ts` is a pure invocation layer over the
// project public API backlog endpoints. This suite drives the route through a
// fake `event.fetch` (no `mock.module`, so sibling settings suites that import
// the real `$lib/server/project-api` are never hijacked).

interface BacklogPayload {
  project: { id: string; name: string };
  sprints: Array<{ id: string; name: string; status: string; capacity_points: number | null }>;
  backlogTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    estimate_points: number | null;
    sprint_id: string | null;
  }>;
}

function defaultBacklog(): BacklogPayload {
  return {
    project: { id: "project-1", name: "Project" },
    sprints: [{ id: "sprint-1", name: "Sprint 1", status: "active", capacity_points: 20 }],
    backlogTasks: [
      { id: "task-1", title: "Backlog task", status: "pending", priority: 5, estimate_points: null, sprint_id: null },
    ],
  };
}

// Fake project public API backlog endpoints:
//   GET    /api/v1/projects/:id/backlog                                  -> load
//   POST   /api/v1/projects/:id/backlog/sprint-tasks                     -> addTask
//   DELETE /api/v1/projects/:id/backlog/sprints/:sprintId/tasks/:taskId  -> removeTask
// `failBacklog` makes the load endpoint reject so the route's 404 mapping
// (`catch -> error(404)`) is exercised. Records every call for assertions.
function fetchBacklog(
  calls: Array<{ method: string; input: unknown }>,
  options: { backlog?: BacklogPayload; failBacklog?: boolean } = {},
): typeof fetch {
  const backlog = options.backlog ?? defaultBacklog();

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id backlog ...

    if (parts.length === 5 && parts[4] === "backlog" && method === "GET") {
      calls.push({ method: "loadProjectBacklog", input: decodeURIComponent(parts[3]!) });
      if (options.failBacklog) return Response.json({ message: "not found" }, { status: 404 });
      return Response.json(backlog);
    }
    if (parts.length === 6 && parts[4] === "backlog" && parts[5] === "sprint-tasks" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({
        method: "addBacklogTaskToSprint",
        input: { projectId: decodeURIComponent(parts[3]!), sprintId: body.sprintId, taskId: body.taskId },
      });
      return new Response(null, { status: 204 });
    }
    if (parts.length === 9 && parts[4] === "backlog" && parts[5] === "sprints" && parts[7] === "tasks" && method === "DELETE") {
      calls.push({
        method: "removeBacklogTaskFromSprint",
        input: {
          projectId: decodeURIComponent(parts[3]!),
          sprintId: decodeURIComponent(parts[6]!),
          taskId: decodeURIComponent(parts[8]!),
        },
      });
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

function loadEvent(id: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/backlog`);
  return { params: { id }, url, locals: {}, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, fetchImpl: typeof fetch, data: Record<string, string>) {
  const url = new URL(`http://localhost/projects/${id}/backlog`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    params: { id },
    url,
    locals: {},
    request: new Request(url, { method: "POST", body: fd }),
    fetch: fetchImpl,
  };
}

describe("/projects/[id]/backlog +page.server.ts", () => {
  test("server route uses the project public API web client, not in-process project scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("$lib/server/project-api");
    expect(source).not.toContain("project-request-scope");
    expect(source).not.toContain("@work-management/interface/project-backlog");
  });

  test("load returns backlog tasks and sprints", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(
      loadEvent("project-1", fetchBacklog(calls)) as Parameters<typeof mod.load>[0],
    );

    expect(result.project.name).toBe("Project");
    expect(result.sprints).toHaveLength(1);
    expect(result.backlogTasks[0]?.title).toBe("Backlog task");
    expect(calls).toEqual([{ method: "loadProjectBacklog", input: "project-1" }]);
  });

  test("load returns 404 when the project public API rejects", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(
      mod.load(
        loadEvent("missing", fetchBacklog(calls, { failBacklog: true })) as Parameters<typeof mod.load>[0],
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("addTask action assigns task to sprint through the public API", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.addTask(
      actionEvent("project-1", fetchBacklog(calls), {
        sprintId: "sprint-1",
        taskId: "task-1",
      }) as Parameters<typeof mod.actions.addTask>[0],
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: "addBacklogTaskToSprint", input: { projectId: "project-1", sprintId: "sprint-1", taskId: "task-1" } },
    ]);
  });

  test("removeTask action unassigns task from sprint through the public API", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.removeTask(
      actionEvent("project-1", fetchBacklog(calls), {
        sprintId: "sprint-1",
        taskId: "task-1",
      }) as Parameters<typeof mod.actions.removeTask>[0],
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: "removeBacklogTaskFromSprint", input: { projectId: "project-1", sprintId: "sprint-1", taskId: "task-1" } },
    ]);
  });

  test("actions validate required sprint and task ids", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.actions.addTask(
      actionEvent("project-1", fetchBacklog(calls), {
        sprintId: "",
        taskId: "",
      }) as Parameters<typeof mod.actions.addTask>[0],
    );

    expect(result.status).toBe(400);
    expect(result.data.error).toBe("sprintId and taskId required");
    expect(calls).toEqual([]);
  });
});
