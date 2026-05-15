import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

interface PublicSavedViewRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  scope: string;
  viewType: string;
  filters: Record<string, unknown>;
  sortBy: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function eventFor(
  projectId: string,
  fetchImpl: typeof fetch = fetchSavedViews(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(`http://localhost/projects/${projectId}/settings/views`);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function fetchSavedViews(calls: string[] = [], seed: PublicSavedViewRow[] = []): typeof fetch {
  const views = seed.map((view) => ({ ...view }));

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname}${url.search} ${headers.get("cookie") ?? ""} ${String(init?.body ?? "")}`);

    if (url.pathname.startsWith("/api/v1/projects/") && method === "GET") {
      return Response.json({ id: decodeURIComponent(url.pathname.split("/").at(-1) ?? ""), name: "Alpha" });
    }

    if (url.pathname === "/api/v1/saved-views" && method === "GET") {
      const projectId = url.searchParams.get("projectId");
      return Response.json(views.filter((view) => view.projectId === projectId));
    }

    if (url.pathname === "/api/v1/saved-views" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.isDefault) clearDefaults(views);
      const row: PublicSavedViewRow = {
        id: `view-${views.length + 1}`,
        orgId: body.orgId,
        projectId: body.projectId,
        name: body.name,
        scope: body.scope ?? "project",
        viewType: body.viewType ?? "list",
        filters: body.filters ?? {},
        sortBy: body.sortBy ?? null,
        isDefault: body.isDefault ?? false,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      };
      views.push(row);
      return Response.json(row, { status: 201 });
    }

    if (url.pathname.startsWith("/api/v1/saved-views/") && method === "PATCH") {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const body = JSON.parse(String(init?.body ?? "{}"));
      const view = views.find((candidate) => candidate.id === id);
      if (!view) return Response.json({ message: "not found" }, { status: 404 });
      if (body.isDefault) clearDefaults(views);
      if (typeof body.name === "string") view.name = body.name;
      if (typeof body.scope === "string") view.scope = body.scope;
      if (body.filters && typeof body.filters === "object" && !Array.isArray(body.filters)) view.filters = body.filters;
      if (typeof body.isDefault === "boolean") view.isDefault = body.isDefault;
      return Response.json(view);
    }

    if (url.pathname.startsWith("/api/v1/saved-views/") && method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const index = views.findIndex((candidate) => candidate.id === id);
      if (index === -1) return Response.json({ message: "not found" }, { status: 404 });
      views.splice(index, 1);
      return new Response(null, { status: 204 });
    }

    return Response.json({ message: `unexpected ${method} ${url.pathname}${url.search}` }, { status: 500 });
  }) as typeof fetch;
}

function seedView(overrides: Partial<PublicSavedViewRow> = {}): PublicSavedViewRow {
  return {
    id: "view-1",
    orgId: "org-1",
    projectId: "project-1",
    name: "Backlog",
    scope: "project",
    viewType: "list",
    filters: {},
    sortBy: null,
    isDefault: false,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

function clearDefaults(views: PublicSavedViewRow[]): void {
  for (const view of views) view.isDefault = false;
}

describe("/projects/[id]/settings/views +page.server.ts", () => {
  test("server route uses the saved-view public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createSavedViewApiForEvent");
    expect(source).toContain("ensureProjectExists");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("@work-management/application/saved-views");
    expect(source).not.toContain("@work-management/application/projects");
  });

  test("load returns empty views list", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("project-1", fetchSavedViews(calls)));

    expect(result.views).toEqual([]);
    expect(result.projectId).toBe("project-1");
    expect(calls).toEqual([
      "GET /api/v1/projects/project-1?orgId=org-1 sid=test-session ",
      "GET /api/v1/saved-views?orgId=org-1&projectId=project-1 sid=test-session ",
    ]);
  });

  test("create view with filters and set as default", async () => {
    const fetchImpl = fetchSavedViews();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "High Priority");
    fd.set("scope", "project");
    fd.set("filters", JSON.stringify({ status: "pending", priority: "high" }));
    fd.set("isDefault", "on");
    await mod.actions.create({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const result = await mod.load(eventFor("project-1", fetchImpl));
    expect(result.views).toHaveLength(1);
    expect(result.views[0].name).toBe("High Priority");
    expect(result.views[0].is_default).toBe(true);
    expect(result.views[0].filters).toEqual({ status: "pending", priority: "high" });
  });

  test("update maps isDefault through the public API", async () => {
    const fetchImpl = fetchSavedViews([], [
      seedView({ id: "view-default", isDefault: true }),
      seedView({ id: "view-next", name: "Next" }),
    ]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("id", "view-next");
    fd.set("name", "Next work");
    fd.set("isDefault", "on");

    const result = await mod.actions.update({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.update>[0]);
    expect((result as { success?: boolean }).success).toBe(true);

    const loaded = await mod.load(eventFor("project-1", fetchImpl));
    expect(loaded.views).toContainEqual(expect.objectContaining({ id: "view-next", name: "Next work", is_default: true }));
    expect(loaded.views).toContainEqual(expect.objectContaining({ id: "view-default", is_default: false }));
  });

  test("delete view", async () => {
    const fetchImpl = fetchSavedViews([], [seedView({ id: "view-delete", name: "Temp" })]);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const delFd = new FormData();
    delFd.set("id", "view-delete");

    await mod.actions.delete({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: delFd }),
    } as Parameters<typeof mod.actions.delete>[0]);

    const afterDelete = await mod.load(eventFor("project-1", fetchImpl));
    expect(afterDelete.views).toHaveLength(0);
  });

  test("invalid filters JSON returns fail 400", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const fd = new FormData();
    fd.set("name", "Broken");
    fd.set("scope", "project");
    fd.set("filters", "{bad");

    const result = await mod.actions.create({
      ...eventFor("project-1"),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    expect((result as { status?: number }).status).toBe(400);
  });
});
