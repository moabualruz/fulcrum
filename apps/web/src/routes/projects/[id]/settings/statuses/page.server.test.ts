import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];

mock.module("$lib/server/project-api", () => ({
  activeOrgId: () => "org-1",
  currentUserId: (locals: { userId?: string | null }) => locals.userId ?? null,
  createProjectApiForEvent: () => ({
    projects: {
      get: async (input: unknown) => {
        calls.push({ method: "projects.get", input });
        return { id: (input as { id: string }).id, name: "Project 1" };
      },
    },
  }),
  ensureProjectExists: async (_event: unknown, projectId: string) => {
    calls.push({ method: "ensureProjectExists", input: projectId });
  },
}));

mock.module("$lib/server/project-status-api", () => ({
  createProjectStatusApiForEvent: () => ({
    projectStatuses: {
      list: async (input: unknown) => {
        calls.push({ method: "projectStatuses.list", input });
        return [{ id: "status-1", name: "Ready", color: "#22c55e", isFinal: false, sortOrder: 1 }];
      },
      create: async (input: unknown) => {
        calls.push({ method: "projectStatuses.create", input });
        return { id: "status-new" };
      },
      update: async (input: unknown) => {
        calls.push({ method: "projectStatuses.update", input });
        return { ok: true };
      },
      delete: async (input: unknown) => {
        calls.push({ method: "projectStatuses.delete", input });
        return { ok: true };
      },
    },
  }),
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/settings/statuses", { method: "POST", body: fd });
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
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({
      projectId: "project-1",
      statuses: [{ id: "status-1", name: "Ready", color: "#22c55e", isFinal: false, sortOrder: 1 }],
    });
    expect(calls).toEqual([
      { method: "ensureProjectExists", input: "project-1" },
      { method: "projectStatuses.list", input: { projectId: "project-1" } },
    ]);
  });

  test("create action validates name and delegates defaults to project status public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const invalid = await mod.actions.create({
      params: { id: "project-1" },
      locals: {},
      request: form({ name: "" }),
    } as Parameters<typeof mod.actions.create>[0]) as { status: number; data: unknown };
    expect(invalid.status).toBe(400);
    expect(invalid.data).toEqual({ error: "Name is required" });
    expect(calls).toEqual([]);

    const result = await mod.actions.create({
      params: { id: "project-1" },
      locals: {},
      request: form({ name: "Done", isFinal: "on" }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([
      { method: "projectStatuses.create", input: { projectId: "project-1", name: "Done", color: "#6b7280", isFinal: true } },
    ]);
  });

  test("update action maps optional fields before delegating", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const missing = await mod.actions.update({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "" }),
    } as Parameters<typeof mod.actions.update>[0]) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });

    const result = await mod.actions.update({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "status-1", name: "Done", color: "#16a34a", isFinal: "on", sortOrder: "7" }),
    } as Parameters<typeof mod.actions.update>[0]);
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([
      { method: "projectStatuses.update", input: { projectId: "project-1", id: "status-1", name: "Done", color: "#16a34a", isFinal: true, sortOrder: 7 } },
    ]);
  });

  test("delete action validates id and delegates to project status public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const missing = await mod.actions.delete({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "" }),
    } as Parameters<typeof mod.actions.delete>[0]) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });
    expect(calls).toEqual([]);

    const result = await mod.actions.delete({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "status-1" }),
    } as Parameters<typeof mod.actions.delete>[0]);
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([{ method: "projectStatuses.delete", input: { projectId: "project-1", id: "status-1" } }]);
  });
});
