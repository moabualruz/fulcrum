import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: unknown }> = [];
let projectPayload: unknown = { project: { id: "project-1", name: "Project 1" } };

mock.module("$lib/server/project-api", () => ({
  activeOrgId: () => "org-1",
  currentUserId: (locals: { userId?: string | null }) => locals.userId ?? null,
  ensureProjectExists: async (_event: unknown, projectId: string) => {
    calls.push({ method: "ensureProjectExists", input: projectId });
  },
  createProjectApiForEvent: () => ({
    projects: {
      get: async (input: unknown) => {
        calls.push({ method: "projects.get", input });
        return projectPayload;
      },
    },
  }),
}));

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

beforeEach(() => {
  calls.splice(0, calls.length);
  projectPayload = { project: { id: "project-1", name: "Project 1" } };
});

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1/repos", { method: "POST", body: fd });
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
    const result = await mod.load({
      params: { id: "project-1" },
      locals: {},
    } as Parameters<typeof mod.load>[0]);

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
    projectPayload = {};
    await expect(mod.load({
      params: { id: "missing" },
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual([{ method: "projects.get", input: { id: "missing" } }]);
  });

  test("add action delegates to repository public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.add({
      params: { id: "project-1" },
      locals: {},
      request: form({ kind: "remote", path: "", url: "https://github.com/acme/fulcrum", name: "fulcrum" }),
    } as Parameters<typeof mod.actions.add>[0]);

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
    const missing = await mod.actions.link({
      params: { id: "project-1" },
      locals: {},
      request: form({ repoId: "" }),
    } as Parameters<typeof mod.actions.link>[0]) as { status: number };
    expect(missing.status).toBe(400);
    expect(calls).toEqual([]);

    const result = await mod.actions.link({
      params: { id: "project-1" },
      locals: {},
      request: form({ repoId: "repo-1" }),
    } as Parameters<typeof mod.actions.link>[0]);
    expect(result).toEqual({ ok: true, mode: "linkRepo" });
    expect(calls).toEqual([{ method: "repos.linkToProject", input: { projectId: "project-1", repoId: "repo-1" } }]);
  });
});
