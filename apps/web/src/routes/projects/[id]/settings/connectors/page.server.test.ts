import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];

// The route's project-existence guard (`ensureProjectExists`) is driven through
// a fake `event.fetch` — no `mock.module("$lib/server/project-api")`, so sibling
// settings suites that import the real module are never hijacked. The connector
// public API is a route-specific seam unrelated to those suites; it stays mocked.
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

// Fake project public API: `GET /api/v1/projects/:id` answers the existence
// check inside `ensureProjectExists`. Records the call for assertions.
function fetchProject(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id
    if (parts.length === 4 && parts[2] === "projects" && method === "GET") {
      calls.push({ method: "ensureProjectExists", input: decodeURIComponent(parts[3]!) });
      return Response.json({ id: decodeURIComponent(parts[3]!), name: "Project 1" });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls.splice(0, calls.length);
});

function loadEvent(id: string) {
  const url = new URL(`http://localhost/projects/${id}/settings/connectors`);
  return { params: { id }, url, locals: {}, request: new Request(url), fetch: fetchProject() };
}

function actionEvent(id: string, data: Record<string, string>) {
  const url = new URL(`http://localhost/projects/${id}/settings/connectors`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    params: { id },
    url,
    locals: {},
    request: new Request(url, { method: "POST", body: fd }),
    fetch: fetchProject(),
  };
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
    const result = await mod.load(loadEvent("project-1") as Parameters<typeof mod.load>[0]);

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
    const result = await mod.actions.upsert(
      actionEvent("project-1", {
        connectorType: "github",
        enabled: "on",
        config: "{\"owner\":\"acme\"}",
      }) as Parameters<typeof mod.actions.upsert>[0],
    );

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
    const missingType = await mod.actions.upsert(
      actionEvent("project-1", { connectorType: "" }) as Parameters<typeof mod.actions.upsert>[0],
    ) as { status: number; data: unknown };
    expect(missingType.status).toBe(400);
    expect(missingType.data).toEqual({ error: "Connector type is required" });

    const invalidJson = await mod.actions.upsert(
      actionEvent("project-1", { connectorType: "github", config: "{" }) as Parameters<
        typeof mod.actions.upsert
      >[0],
    ) as { status: number; data: unknown };
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.data).toEqual({ error: "Invalid config JSON" });
    expect(calls).toEqual([]);
  });

  test("sync action validates id and delegates to connector public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const missing = await mod.actions.sync(
      actionEvent("project-1", { id: "" }) as Parameters<typeof mod.actions.sync>[0],
    ) as { status: number; data: unknown };
    expect(missing.status).toBe(400);
    expect(missing.data).toEqual({ error: "id required" });
    expect(calls).toEqual([]);

    const result = await mod.actions.sync(
      actionEvent("project-1", { id: "connector-1" }) as Parameters<typeof mod.actions.sync>[0],
    );
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([{ method: "projectConnectors.sync", input: { id: "connector-1" } }]);
  });
});
