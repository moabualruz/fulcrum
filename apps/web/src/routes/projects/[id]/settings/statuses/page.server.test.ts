import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface StatusRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

const statuses: StatusRow[] = [];
const appScope = { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1" } };

function eventFor(
  projectId: string,
  fetchImpl: typeof fetch = fetchProject(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(`http://localhost/projects/${projectId}/settings/statuses`);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function fetchProject(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname}${url.search} ${headers.get("cookie") ?? ""}`);
    if (url.pathname.startsWith("/api/v1/projects/") && method === "GET") {
      return Response.json({ id: decodeURIComponent(url.pathname.split("/").at(-1) ?? ""), name: "Alpha" });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}${url.search}` }, { status: 500 });
  }) as typeof fetch;
}

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async () => appScope,
}));

mock.module("$lib/server/project-statuses", () => ({
  listProjectStatuses: async (_em: unknown, projectId: string) =>
    statuses.filter((status) => status.project_id === projectId),
  createProjectStatus: async (_em: unknown, input: { orgId: string; projectId: string; name: string; color?: string; isFinal?: boolean }) => {
    const row: StatusRow = {
      id: `status-${statuses.length + 1}`,
      org_id: input.orgId,
      project_id: input.projectId,
      name: input.name,
      color: input.color ?? "#6b7280",
      sort_order: statuses.length,
      is_final: input.isFinal ?? false,
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    };
    statuses.push(row);
    return { id: row.id };
  },
  updateProjectStatus: async (_em: unknown, input: { id: string; name?: string; color?: string; sortOrder?: number; isFinal?: boolean }) => {
    const row = statuses.find((status) => status.id === input.id);
    if (!row) throw new Error(`missing status ${input.id}`);
    if (input.name !== undefined) row.name = input.name;
    if (input.color !== undefined) row.color = input.color;
    if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
    if (input.isFinal !== undefined) row.is_final = input.isFinal;
    return { ok: true };
  },
  deleteProjectStatus: async (_em: unknown, id: string) => {
    const index = statuses.findIndex((status) => status.id === id);
    if (index !== -1) statuses.splice(index, 1);
    return { ok: true };
  },
}));

beforeEach(() => {
  statuses.splice(0, statuses.length);
});

describe("/projects/[id]/settings/statuses +page.server.ts", () => {
  test("server route uses project/status helpers instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("ensureProjectExists");
    expect(source).toContain("$lib/server/project-statuses");
    expect(source).not.toContain("@work-management/application/project-statuses");
    expect(source).not.toContain("@work-management/application/projects");
    expect(source).not.toContain("getProjectOrNull");
  });

  test("load returns empty statuses list", async () => {
    const id = "project-1";
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor(id, fetchProject(calls)));
    expect(result.statuses).toEqual([]);
    expect(result.projectId).toBe(id);
    expect(calls).toEqual(["GET /api/v1/projects/project-1?orgId=org-1 sid=test-session"]);
  });

  test("create + delete status cycle", async () => {
    const id = "project-1";
    const fetchImpl = fetchProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "In Review");
    fd.set("color", "#3b82f6");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    await mod.actions.create({
      ...eventFor(id, fetchImpl),
      request,
    } as Parameters<typeof mod.actions.create>[0]);

    const afterCreate = await mod.load(eventFor(id, fetchImpl));
    expect(afterCreate.statuses).toHaveLength(1);
    expect(afterCreate.statuses[0].name).toBe("In Review");
    expect(afterCreate.statuses[0].color).toBe("#3b82f6");

    const delFd = new FormData();
    delFd.set("id", afterCreate.statuses[0].id);
    await mod.actions.delete({
      ...eventFor(id, fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: delFd }),
    } as Parameters<typeof mod.actions.delete>[0]);

    const afterDelete = await mod.load(eventFor(id, fetchImpl));
    expect(afterDelete.statuses).toHaveLength(0);
  });

  test("create with isFinal flag", async () => {
    const id = "project-1";
    const fetchImpl = fetchProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("name", "Done");
    fd.set("isFinal", "on");
    await mod.actions.create({
      ...eventFor(id, fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const result = await mod.load(eventFor(id, fetchImpl));
    expect(result.statuses[0].is_final).toBe(true);
  });

  test("update maps status fields through helper action", async () => {
    const id = "project-1";
    const fetchImpl = fetchProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    statuses.push({
      id: "status-update",
      org_id: "org-1",
      project_id: id,
      name: "Review",
      color: "#6b7280",
      sort_order: 0,
      is_final: false,
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    });

    const fd = new FormData();
    fd.set("id", "status-update");
    fd.set("name", "Accepted");
    fd.set("color", "#22c55e");
    fd.set("sortOrder", "4");
    fd.set("isFinal", "on");
    await mod.actions.update({
      ...eventFor(id, fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.update>[0]);

    const result = await mod.load(eventFor(id, fetchImpl));
    expect(result.statuses).toContainEqual(expect.objectContaining({
      id: "status-update",
      name: "Accepted",
      color: "#22c55e",
      sort_order: 4,
      is_final: true,
    }));
  });
});
