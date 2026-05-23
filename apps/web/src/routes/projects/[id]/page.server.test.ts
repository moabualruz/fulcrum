import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// `/projects/[id]/+page.server.ts` is a pure invocation layer over the project
// public API (`createProjectApiForEvent`). This suite drives the route through
// a fake `event.fetch` (no `mock.module`, so sibling settings suites that
// import the real `$lib/server/project-api` are never hijacked).

interface ProjectOverview {
  project: { id: string; slug: string; name: string; description: string | null; updated_at: string };
  summary: { openTasks: number; inProgress: number; done: number; sprintDaysRemaining: number };
}

function defaultOverview(id = "project-1"): ProjectOverview {
  return {
    project: {
      id,
      slug: "alpha",
      name: "Alpha",
      description: "first project",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
    summary: { openTasks: 2, inProgress: 1, done: 1, sprintDaysRemaining: 0 },
  };
}

// A fake project public API. `GET /api/v1/projects/:id/overview` returns the
// supplied overview (or 404 when `overview` is null, mirroring the real
// client's `ProjectApiError(404)`); `PATCH /api/v1/projects/:id` records the
// update; `DELETE /api/v1/projects/:id` records the deletion.
function fetchProject(
  calls: Array<{ method: string; input: unknown }>,
  options: {
    overview?: ProjectOverview | null;
    updates?: Array<{ id: string; name?: string; description?: string | null }>;
    deleted?: string[];
  } = {},
): typeof fetch {
  const overview = options.overview === undefined ? defaultOverview() : options.overview;
  const updates = options.updates ?? [];
  const deleted = options.deleted ?? [];

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id [overview]

    if (parts.length === 5 && parts[2] === "projects" && parts[4] === "overview" && method === "GET") {
      calls.push({ method: "projects.overview", input: { id: decodeURIComponent(parts[3]!) } });
      if (overview === null) return Response.json({ message: "Project not found" }, { status: 404 });
      return Response.json(overview);
    }
    if (parts.length === 4 && parts[2] === "projects" && method === "PATCH") {
      const id = decodeURIComponent(parts[3]!);
      const body = JSON.parse(String(init?.body ?? "{}"));
      const update = { id, name: body.name, description: body.description };
      updates.push(update);
      calls.push({ method: "projects.update", input: update });
      return Response.json({ ok: true });
    }
    if (parts.length === 4 && parts[2] === "projects" && method === "DELETE") {
      const id = decodeURIComponent(parts[3]!);
      deleted.push(id);
      calls.push({ method: "projects.delete", input: { id } });
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1", { method: "POST", body: fd });
}

function redirectOf(value: unknown): { status?: number; location?: string } {
  return value as { status?: number; location?: string };
}

function loadEvent(
  id: string,
  fetchImpl: typeof fetch,
  parent?: () => Promise<{ activeProjectId: string | null }>,
) {
  const url = new URL(`http://localhost/projects/${id}`);
  return { params: { id }, parent, url, locals: {}, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, fetchImpl: typeof fetch, request: Request) {
  const url = new URL(`http://localhost/projects/${id}`);
  return { params: { id }, url, locals: {}, request, fetch: fetchImpl };
}

describe("/projects/[id] +page.server.ts", () => {
  test("server route uses the project public API instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createProjectApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("$lib/server/application-scope");
    expect(source).not.toContain("@work-management/application/projects");
  });

  test("load returns project summary and a rename form", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(
      loadEvent("project-1", fetchProject(calls), async () => ({
        activeProjectId: "project-1",
      })) as Parameters<typeof mod.load>[0],
    );

    expect(result.project.id).toBe("project-1");
    expect(result.project.slug).toBe("alpha");
    expect(result.summary).toEqual({ openTasks: 2, inProgress: 1, done: 1, sprintDaysRemaining: 0 });
    expect(result.form?.data?.name).toBe("Alpha");
    expect(result.form?.data?.description).toBe("first project");
    expect(result.activeProjectId).toBe("project-1");
    expect(calls).toEqual([{ method: "projects.overview", input: { id: "project-1" } }]);
  });

  test("load throws 404 when the project public API reports the id is missing", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(
      mod.load(
        loadEvent("missing-project", fetchProject(calls, { overview: null })) as Parameters<typeof mod.load>[0],
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual([{ method: "projects.overview", input: { id: "missing-project" } }]);
  });

  test("rename action validates and updates through the public API", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const updates: Array<{ id: string; name?: string; description?: string | null }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.rename(
      actionEvent(
        "project-1",
        fetchProject(calls, { updates }),
        form({ name: "NewName", description: "after" }),
      ) as Parameters<typeof mod.actions.rename>[0],
    );

    expect((result as { form?: unknown }).form).toBeDefined();
    expect(updates).toEqual([{ id: "project-1", name: "NewName", description: "after" }]);
    expect(calls).toEqual([
      { method: "projects.update", input: { id: "project-1", name: "NewName", description: "after" } },
    ]);
  });

  test("rename action returns fail(400, { form }) when name is empty and skips the public API", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = (await mod.actions.rename(
      actionEvent(
        "project-1",
        fetchProject(calls),
        form({ name: "", description: "anything" }),
      ) as Parameters<typeof mod.actions.rename>[0],
    )) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };

    expect(result.status).toBe(400);
    expect(result.data?.form?.valid).toBe(false);
    expect(calls).toEqual([]);
  });

  test("delete action deletes through the public API and redirects", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const deleted: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let thrown: unknown;
    try {
      await mod.actions.delete(
        actionEvent(
          "project-1",
          fetchProject(calls, { deleted }),
          new Request("http://localhost/projects/project-1", { method: "POST" }),
        ) as Parameters<typeof mod.actions.delete>[0],
      );
    } catch (error) {
      thrown = error;
    }

    expect(deleted).toEqual(["project-1"]);
    expect(calls).toEqual([{ method: "projects.delete", input: { id: "project-1" } }]);
    expect(redirectOf(thrown).status).toBe(303);
    expect(redirectOf(thrown).location).toBe("/projects");
  });
});
