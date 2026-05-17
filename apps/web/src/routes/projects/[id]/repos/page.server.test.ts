import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface RepoCard {
  id: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  currentBranch: string | null;
  syncStatus: "idle" | "syncing" | "error";
  remoteUrl: string | null;
  localPath: string | null;
  openTaskCount: number;
  lastCommits: Array<{ subject: string; relativeTime: string }>;
  projectId: string | null;
}

const repos: RepoCard[] = [];
const appScope = { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1", projectId: null as string | null } };

function eventFor(
  projectId: string,
  fetchImpl: typeof fetch = fetchProject(),
): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL(`http://localhost/projects/${projectId}/repos`);
  return {
    params: { id: projectId },
    url,
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchImpl,
    request: new Request(url, { headers: { cookie: "sid=test-session" } }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

function fetchProject(calls: string[] = [], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push(`${method} ${url.pathname}${url.search} ${headers.get("cookie") ?? ""}`);
    if (url.pathname.startsWith("/api/v1/projects/") && method === "GET") {
      if (status === 404) return Response.json({ message: "not found" }, { status });
      return Response.json({ id: decodeURIComponent(url.pathname.split("/").at(-1) ?? ""), name: "Alpha" });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}${url.search}` }, { status: 500 });
  }) as typeof fetch;
}

function repo(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: "repo-1",
    name: "Fulcrum",
    slug: "fulcrum",
    kind: "local",
    currentBranch: "main",
    syncStatus: "idle",
    remoteUrl: null,
    localPath: "/workspace/fulcrum",
    openTaskCount: 0,
    lastCommits: [],
    projectId: "project-1",
    ...overrides,
  };
}

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId?: string) => ({
    ...appScope,
    ctx: { ...appScope.ctx, projectId: projectId ?? null },
  }),
}));

mock.module("@integration-hub/interface/project-repositories.ts", () => ({
  listProjectRepoCards: async (_em: unknown, ctx: { projectId?: string | null }) =>
    repos.filter((candidate) => candidate.projectId === ctx.projectId),
  addProjectRepo: async (
    _em: unknown,
    ctx: { projectId?: string | null },
    input: { kind: "local" | "remote"; path?: string | null; url?: string | null; name?: string | null },
  ) => {
    const row = repo({
      id: `repo-${repos.length + 1}`,
      name: input.name?.trim() || "New Repo",
      slug: input.name?.trim().toLowerCase().replace(/\s+/g, "-") || "new-repo",
      kind: input.kind,
      localPath: input.kind === "local" ? input.path ?? null : null,
      remoteUrl: input.kind === "remote" ? input.url ?? null : null,
      projectId: ctx.projectId ?? null,
    });
    repos.push(row);
    return { id: row.id };
  },
  linkProjectRepoToProject: async (_em: unknown, ctx: { projectId?: string | null }, repoId: string) => {
    const row = repos.find((candidate) => candidate.id === repoId);
    if (!row) throw new Error(`missing repo ${repoId}`);
    row.projectId = ctx.projectId ?? null;
    return { ok: true };
  },
}));

beforeEach(() => {
  repos.splice(0, repos.length);
});

describe("/projects/[id]/repos +page.server.ts", () => {
  test("server route uses project API and repo interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createProjectApiForEvent");
    expect(source).toContain("@integration-hub/interface/project-repositories");
    expect(source).not.toContain("@integration-hub/application/repos");
    expect(source).not.toContain("@work-management/application/projects");
    expect(source).not.toContain("getProjectOrNull");
  });

  test("load returns repos scoped to the given project", async () => {
    repos.push(
      repo({ id: "repo-1", projectId: "project-1" }),
      repo({ id: "repo-2", slug: "ui", name: "UI Lib", kind: "remote", projectId: "project-1" }),
      repo({ id: "repo-other", projectId: "project-2" }),
    );
    const calls: string[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("project-1", fetchProject(calls)));
    expect(result.project).toEqual({ id: "project-1", name: "Alpha" });
    expect(result.repos.map((candidate) => candidate.id)).toEqual(["repo-1", "repo-2"]);
    expect(calls).toEqual(["GET /api/v1/projects/project-1?orgId=org-1 sid=test-session"]);
  });

  test("load throws 404 for nonexistent project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(mod.load(eventFor("missing-project", fetchProject([], 404)))).rejects.toMatchObject({ status: 404 });
  });

  test("add action creates a repo pre-linked to the project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("kind", "local");
    fd.set("path", "/tmp/new-repo");
    fd.set("name", "New Repo");
    const result = await mod.actions.add({
      ...eventFor("project-1"),
      request: new Request("http://localhost/projects/x/repos", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.add>[0]);
    expect(result).toEqual({ ok: true });

    const loadResult = await mod.load(eventFor("project-1"));
    expect(loadResult.repos).toContainEqual(expect.objectContaining({ name: "New Repo", projectId: "project-1" }));
  });

  test("link action links an existing unlinked repo to the project", async () => {
    repos.push(repo({ id: "repo-orphan", name: "Orphan", projectId: null }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("repoId", "repo-orphan");
    const result = await mod.actions.link({
      ...eventFor("project-1"),
      request: new Request("http://localhost/projects/x/repos", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.link>[0]);
    expect(result).toEqual({ ok: true });

    const loadResult = await mod.load(eventFor("project-1"));
    expect(loadResult.repos).toContainEqual(expect.objectContaining({ id: "repo-orphan", projectId: "project-1" }));
  });
});
