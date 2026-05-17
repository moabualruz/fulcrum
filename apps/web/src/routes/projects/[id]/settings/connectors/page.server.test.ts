import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface ConnectorRow {
  id: string;
  org_id: string;
  project_id: string;
  connector_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

const connectors: ConnectorRow[] = [];
const appScope = { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1" } };

function eventFor(
  projectId: string,
  fetchImpl: typeof fetch = fetchProject(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(`http://localhost/projects/${projectId}/settings/connectors`);
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

mock.module("@integration-hub/interface/project-connectors.ts", () => ({
  listProjectConnectors: async (_em: unknown, projectId: string) =>
    connectors.filter((connector) => connector.project_id === projectId),
  upsertProjectConnector: async (
    _em: unknown,
    input: {
      orgId: string;
      projectId: string;
      connectorType: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    },
  ) => {
    const existing = connectors.find((connector) =>
      connector.project_id === input.projectId && connector.connector_type === input.connectorType
    );
    if (existing) {
      existing.enabled = input.enabled ?? existing.enabled;
      existing.config = input.config ?? existing.config;
      return { id: existing.id };
    }
    const row: ConnectorRow = {
      id: `connector-${connectors.length + 1}`,
      org_id: input.orgId,
      project_id: input.projectId,
      connector_type: input.connectorType,
      enabled: input.enabled ?? false,
      config: input.config ?? {},
      last_synced_at: null,
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    };
    connectors.push(row);
    return { id: row.id };
  },
  syncProjectConnector: async (_em: unknown, id: string) => {
    const row = connectors.find((connector) => connector.id === id);
    if (!row) throw new Error(`missing connector ${id}`);
    row.last_synced_at = "2026-05-15T00:00:00.000Z";
    return { ok: true };
  },
}));

beforeEach(() => {
  connectors.splice(0, connectors.length);
});

describe("/projects/[id]/settings/connectors +page.server.ts", () => {
  test("server route uses project and connector interfaces instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("ensureProjectExists");
    expect(source).toContain("@integration-hub/interface/project-connectors");
    expect(source).not.toContain("@integration-hub/application/project-connectors");
    expect(source).not.toContain("@work-management/application/projects");
    expect(source).not.toContain("getProjectOrNull");
  });

  test("load returns empty connectors list", async () => {
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("project-1", fetchProject(calls)));
    expect(result.connectors).toEqual([]);
    expect(result.projectId).toBe("project-1");
    expect(calls).toEqual(["GET /api/v1/projects/project-1?orgId=org-1 sid=test-session"]);
  });

  test("upsert creates connector, second upsert updates it", async () => {
    const fetchImpl = fetchProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("connectorType", "jira");
    fd.set("config", JSON.stringify({ host: "jira.example.com" }));
    await mod.actions.upsert({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    let result = await mod.load(eventFor("project-1", fetchImpl));
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].connector_type).toBe("jira");
    expect(result.connectors[0].enabled).toBe(false);

    const fd2 = new FormData();
    fd2.set("connectorType", "jira");
    fd2.set("enabled", "on");
    fd2.set("config", JSON.stringify({ host: "new.example.com" }));
    await mod.actions.upsert({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: fd2 }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    result = await mod.load(eventFor("project-1", fetchImpl));
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].enabled).toBe(true);
    expect(result.connectors[0].config).toEqual({ host: "new.example.com" });
  });

  test("sync connector succeeds", async () => {
    const fetchImpl = fetchProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    connectors.push({
      id: "connector-sync",
      org_id: "org-1",
      project_id: "project-1",
      connector_type: "jira",
      enabled: true,
      config: {},
      last_synced_at: null,
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
    });

    const syncFd = new FormData();
    syncFd.set("id", "connector-sync");
    const result = await mod.actions.sync({
      ...eventFor("project-1", fetchImpl),
      request: new Request("http://localhost", { method: "POST", body: syncFd }),
    } as Parameters<typeof mod.actions.sync>[0]);

    expect((result as { success?: boolean }).success).toBe(true);
    expect(connectors[0].last_synced_at).toBe("2026-05-15T00:00:00.000Z");
  });
});
