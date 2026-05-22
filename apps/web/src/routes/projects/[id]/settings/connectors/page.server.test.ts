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

mock.module("$lib/server/connector-api", () => ({
  createConnectorApiForEvent: () => ({
    projectConnectors: {
      list: async (input: unknown) => {
        calls.push({ method: "projectConnectors.list", input });
        return [{ id: "connector-1", connectorType: "github", enabled: true, config: { owner: "acme" } }];
      },
      upsert: async (input: unknown) => {
        calls.push({ method: "projectConnectors.upsert", input });
        return { id: "connector-1" };
      },
      sync: async (input: unknown) => {
        calls.push({ method: "projectConnectors.sync", input });
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
  return new Request("http://localhost/projects/project-1/settings/connectors", { method: "POST", body: fd });
}

describe("/projects/[id]/settings/connectors +page.server.ts", () => {
  test("server route uses connector public API instead of application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createConnectorApiForEvent");
    expect(source).toContain("ensureProjectExists");
    expect(source).not.toContain("requestAppScope");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@work-management/application/");
  });

  test("load ensures project and returns project connectors", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result).toEqual({
      projectId: "project-1",
      connectors: [{ id: "connector-1", connectorType: "github", enabled: true, config: { owner: "acme" } }],
    });
    expect(calls).toEqual([
      { method: "ensureProjectExists", input: "project-1" },
      { method: "projectConnectors.list", input: { projectId: "project-1" } },
    ]);
  });

  test("upsert action parses config JSON and delegates to connector public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.upsert({
      params: { id: "project-1" },
      locals: {},
      request: form({ connectorType: "github", enabled: "on", config: "{\"owner\":\"acme\"}" }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    expect(result).toEqual({ success: true });
    expect(calls).toEqual([
      {
        method: "projectConnectors.upsert",
        input: { projectId: "project-1", connectorType: "github", enabled: true, config: { owner: "acme" } },
      },
    ]);
  });

  test("upsert action validates connector type and config JSON before delegating", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const missingType = await mod.actions.upsert({
      params: { id: "project-1" },
      locals: {},
      request: form({ connectorType: "" }),
    } as Parameters<typeof mod.actions.upsert>[0]) as { status: number; data: unknown };
    expect(missingType.status).toBe(400);
    expect(missingType.data).toEqual({ error: "Connector type is required" });

    const invalidJson = await mod.actions.upsert({
      params: { id: "project-1" },
      locals: {},
      request: form({ connectorType: "github", config: "{" }),
    } as Parameters<typeof mod.actions.upsert>[0]) as { status: number; data: unknown };
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.data).toEqual({ error: "Invalid config JSON" });
    expect(calls).toEqual([]);
  });

  test("sync action validates id and delegates to connector public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const missing = await mod.actions.sync({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "" }),
    } as Parameters<typeof mod.actions.sync>[0]) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });
    expect(calls).toEqual([]);

    const result = await mod.actions.sync({
      params: { id: "project-1" },
      locals: {},
      request: form({ id: "connector-1" }),
    } as Parameters<typeof mod.actions.sync>[0]);
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([{ method: "projectConnectors.sync", input: { id: "connector-1" } }]);
  });
});
