import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];

// The route's project header read (`createProjectApiForEvent(event).projects.get`)
// is driven through a fake `event.fetch` — no `mock.module("$lib/server/project-api")`,
// so sibling settings suites that import the real module are never hijacked. The
// repository public API is a route-specific seam and stays mocked.
mock.module("$lib/server/repository-api", () => ({
  createRepositoryApiForEvent: () => ({
    repos: {
      projectCards: async (input: unknown) => {
        calls.push({ method: "repos.projectCards", input });
        return [{ id: "repo-1", name: "fulcrum", linked: true }];
      },
      addToProject: async (input: unknown) => {
        calls.push({ method: "repos.addToProject", input });
        return { id: "repo-2" };
      },
      linkToProject: async (input: unknown) => {
        calls.push({ method: "repos.linkToProject", input });
        return { ok: true };
      },
    },
  }),
}));

// Fake project public API: `GET /api/v1/projects/:id` answers `projects.get`
// inside the route's `loadProject` helper. `payload` controls the response
// body so a missing-header case can be exercised.
function fetchProject(payload: unknown = { project: { id: "project-1", name: "Project 1" } }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id
    if (parts.length === 4 && parts[2] === "projects" && method === "GET") {
      calls.push({ method: "projects.get", input: { id: decodeURIComponent(parts[3]!) } });
      return Response.json(payload);
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls.splice(0, calls.length);
});

function loadEvent(id: string, fetchImpl: typeof fetch) {
  const url = new URL(`http://localhost/projects/${id}/repos`);
  return { params: { id }, url, locals: {}, request: new Request(url), fetch: fetchImpl };
}

function actionEvent(id: string, fetchImpl: typeof fetch, data: Record<string, string>) {
  const url = new URL(`http://localhost/projects/${id}/repos`);
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

describe("/projects/[id]/repos +page.server.ts", () => {
  test("server route uses project and repository public APIs instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createProjectApiForEvent");
    expect(source).toContain("createRepositoryApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("@work-management/application/");
  });

  test("load returns project header and linked repository cards", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(
      loadEvent("project-1", fetchProject()) as Parameters<typeof mod.load>[0],
    );

    expect(result).toEqual({
      project: { id: "project-1", name: "Project 1" },
      repos: [{ id: "repo-1", name: "fulcrum", linked: true }],
    });
    expect(calls).toEqual([
      { method: "projects.get", input: { id: "project-1" } },
      { method: "repos.projectCards", input: { projectId: "project-1" } },
    ]);
  });

  test("load returns 404 when project public API payload lacks header fields", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(
      mod.load(loadEvent("missing", fetchProject({})) as Parameters<typeof mod.load>[0]),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual([{ method: "projects.get", input: { id: "missing" } }]);
  });

  test("add action delegates to repository public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.add(
      actionEvent("project-1", fetchProject(), {
        kind: "remote",
        path: "",
        url: "https://github.com/acme/fulcrum",
        name: "fulcrum",
      }) as Parameters<typeof mod.actions.add>[0],
    );

    expect(result).toEqual({ ok: true, mode: "addRepo" });
    expect(calls).toEqual([
      {
        method: "repos.addToProject",
        input: { projectId: "project-1", kind: "remote", path: "", url: "https://github.com/acme/fulcrum", name: "fulcrum" },
      },
    ]);
  });

  test("link action validates repo id and delegates to repository public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const missing = await mod.actions.link(
      actionEvent("project-1", fetchProject(), { repoId: "" }) as Parameters<typeof mod.actions.link>[0],
    ) as { status: number };
    expect(missing.status).toBe(400);
    expect(calls).toEqual([]);

    const result = await mod.actions.link(
      actionEvent("project-1", fetchProject(), { repoId: "repo-1" }) as Parameters<typeof mod.actions.link>[0],
    );
    expect(result).toEqual({ ok: true, mode: "linkRepo" });
    expect(calls).toEqual([{ method: "repos.linkToProject", input: { projectId: "project-1", repoId: "repo-1" } }]);
  });
});
