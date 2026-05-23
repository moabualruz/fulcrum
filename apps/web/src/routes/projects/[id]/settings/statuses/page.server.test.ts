import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// `/projects/[id]/settings/statuses/+page.server.ts` is a pure invocation
// layer: `load` calls `ensureProjectExists` + `createProjectStatusApiForEvent`,
// the actions call the project-status public API. This suite drives the route
// through a fake `event.fetch` (no `mock.module`, so sibling settings suites
// that import the real `$lib/server/project-api` are never hijacked).

interface PublicStatusRow {
  id: string;
  name: string;
  color: string;
  isFinal: boolean;
  sortOrder: number;
}

function statusEvent(projectId: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${projectId}/settings/statuses`);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { method: "POST", headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function actionEvent(projectId: string, fetchImpl: typeof fetch, data: Record<string, string>) {
  const url = new URL(`http://localhost/projects/${projectId}/settings/statuses`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { method: "POST", body: fd, headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").actions.create>[0];
}

// A fake project-status public API: `GET /api/v1/projects/:id` (project
// existence), `GET/POST /api/v1/projects/:id/statuses`, `PATCH/DELETE
// /api/v1/projects/:id/statuses/:statusId`. Records every call for assertions.
function fetchStatuses(calls: string[] = [], seed: PublicStatusRow[] = []): typeof fetch {
  const statuses = seed.map((status) => ({ ...status }));
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${method} ${url.pathname}`);
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id statuses :statusId?

    if (parts.length === 4 && parts[2] === "projects" && method === "GET") {
      return Response.json({ id: decodeURIComponent(parts[3]!), name: "Project 1" });
    }
    if (parts.length === 5 && parts[4] === "statuses" && method === "GET") {
      return Response.json(statuses);
    }
    if (parts.length === 5 && parts[4] === "statuses" && method === "POST") {
      const row = {
        id: "status-new",
        name: body.name,
        color: body.color,
        isFinal: body.isFinal ?? false,
        sortOrder: statuses.length + 1,
      };
      statuses.push(row);
      return Response.json(row, { status: 201 });
    }
    if (parts.length === 6 && parts[4] === "statuses" && method === "PATCH") {
      return Response.json({ ok: true });
    }
    if (parts.length === 6 && parts[4] === "statuses" && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

describe("/projects/[id]/settings/statuses +page.server.ts", () => {
  test("server route uses project status public API instead of application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createProjectStatusApiForEvent");
    expect(source).toContain("ensureProjectExists");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@work-management/application/");
  });

  test("load ensures project and returns statuses", async () => {
    const calls: string[] = [];
    const fetchImpl = fetchStatuses(calls, [
      { id: "status-1", name: "Ready", color: "#22c55e", isFinal: false, sortOrder: 1 },
    ]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(statusEvent("project-1", fetchImpl));

    expect(result).toEqual({
      projectId: "project-1",
      statuses: [{ id: "status-1", name: "Ready", color: "#22c55e", isFinal: false, sortOrder: 1 }],
    });
    expect(calls).toEqual(["GET /api/v1/projects/project-1", "GET /api/v1/projects/project-1/statuses"]);
  });

  test("create action validates name and delegates defaults to project status public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const invalid = (await mod.actions.create(
      actionEvent("project-1", fetchStatuses(), { name: "" }),
    )) as { status: number; data: unknown };
    expect(invalid.status).toBe(400);
    expect(invalid.data).toEqual({ error: "Name is required" });

    const calls: string[] = [];
    const result = await mod.actions.create(
      actionEvent("project-1", fetchStatuses(calls), { name: "Done", isFinal: "on" }),
    );
    expect(result).toEqual({ success: true });
    expect(calls).toEqual(["POST /api/v1/projects/project-1/statuses"]);
  });

  test("update action maps optional fields before delegating", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const missing = (await mod.actions.update(
      actionEvent("project-1", fetchStatuses(), { id: "" }),
    )) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });

    const calls: string[] = [];
    const result = await mod.actions.update(
      actionEvent("project-1", fetchStatuses(calls), {
        id: "status-1",
        name: "Done",
        color: "#16a34a",
        isFinal: "on",
        sortOrder: "7",
      }),
    );
    expect(result).toEqual({ success: true });
    expect(calls).toEqual(["PATCH /api/v1/projects/project-1/statuses/status-1"]);
  });

  test("delete action validates id and delegates to project status public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const missing = (await mod.actions.delete(
      actionEvent("project-1", fetchStatuses(), { id: "" }),
    )) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });

    const calls: string[] = [];
    const result = await mod.actions.delete(
      actionEvent("project-1", fetchStatuses(calls), { id: "status-1" }),
    );
    expect(result).toEqual({ success: true });
    expect(calls).toEqual(["DELETE /api/v1/projects/project-1/statuses/status-1"]);
  });
});
