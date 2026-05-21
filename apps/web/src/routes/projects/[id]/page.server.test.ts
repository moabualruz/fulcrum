import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock, useApplicationScope } from "$lib/test/application-scope-mock";
import { projectLifecycleMock, useProjectLifecycle } from "$lib/test/project-lifecycle-mock";

const updates: Array<{ id: string; name?: string; description?: string | null }> = [];
const deleted: string[] = [];
let overview: {
  project: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    updated_at: string;
  };
  summary: {
    openTasks: number;
    inProgress: number;
    done: number;
    sprintDaysRemaining: number;
  };
} | null = null;

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1", { method: "POST", body: fd });
}

function redirectOf(value: unknown): { status?: number; location?: string } {
  return value as { status?: number; location?: string };
}

// `mock.module` is process-wide and only one factory closure survives per
// path. `applicationScopeMock()` routes through a shared seam slot; this suite
// publishes its seam while active (beforeAll/afterAll) so sibling suites that
// mock the same path are never hijacked.
mock.module("$lib/server/application-scope", () => applicationScopeMock());

mock.module("@work-management/interface/project-lifecycle.ts", () => projectLifecycleMock());

const projectLifecycleOverrides = {
  loadProjectOverview: async () => overview,
  updateProject: async (_em: unknown, _ctx: unknown, input: { id: string; name?: string; description?: string | null }) => {
    updates.push(input);
    return { ok: true };
  },
  deleteProject: async (_em: unknown, _ctx: unknown, id: string) => {
    deleted.push(id);
    return { ok: true };
  },
  listProjectOptions: async () => [],
  createProject: async () => ({ id: "project-created", slug: "created", name: "Created", parentId: null, kind: "project", path: "created", depth: 0 }),
  createProjectFromSetup: async () => ({
    links: {
      project: { id: "project-created", slug: "created", path: "created" },
      repo: { id: "", localPath: null, syncStatus: "missing" },
      workflow: { id: "workflow-1" },
    },
    template: { id: "template-1", name: "Template", workflow: { id: "workflow-1" } },
    trace: { audit: "event-1" },
  }),
};

beforeEach(() => {
  updates.splice(0, updates.length);
  deleted.splice(0, deleted.length);
  overview = {
    project: {
      id: "project-1",
      slug: "alpha",
      name: "Alpha",
      description: "first project",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
    summary: {
      openTasks: 2,
      inProgress: 1,
      done: 1,
      sprintDaysRemaining: 0,
    },
  };
});

describe("/projects/[id] +page.server.ts", () => {
  let disposeScope: (() => void) | undefined;
  let disposeLifecycle: (() => void) | undefined;
  beforeAll(() => {
    disposeScope = useApplicationScope((_locals, projectId) => ({
      em: { kind: "mock-em" },
      ctx: { orgId: "org-1", userId: "user-1", projectId: projectId ?? null },
    }));
    disposeLifecycle = useProjectLifecycle(projectLifecycleOverrides);
  });
  afterAll(() => {
    disposeScope?.();
    disposeLifecycle?.();
  });

  test("server route uses the project lifecycle interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@work-management/interface/project-lifecycle");
    expect(source).not.toContain("@work-management/application/projects");
    expect(source).not.toContain("$lib/server/application-scope");
  });

  test("load returns project summary and a rename form", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "project-1" },
      parent: async () => ({ activeProjectId: "project-1" }),
      locals: {},
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe("project-1");
    expect(result.project.slug).toBe("alpha");
    expect(result.summary).toEqual({ openTasks: 2, inProgress: 1, done: 1, sprintDaysRemaining: 0 });
    expect(result.form?.data?.name).toBe("Alpha");
    expect(result.form?.data?.description).toBe("first project");
    expect(result.activeProjectId).toBe("project-1");
  });

  test("load throws 404 when the project id does not exist", async () => {
    overview = null;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(mod.load({
      params: { id: "missing-project" },
      locals: {},
    } as Parameters<typeof mod.load>[0])).rejects.toMatchObject({ status: 404 });
  });

  test("rename action validates and updates through the service boundary", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.rename({
      params: { id: "project-1" },
      request: form({ name: "NewName", description: "after" }),
      locals: {},
    } as Parameters<typeof mod.actions.rename>[0]);

    expect((result as { form?: unknown }).form).toBeDefined();
    expect(updates).toEqual([{ id: "project-1", name: "NewName", description: "after" }]);
  });

  test("rename action returns fail(400, { form }) when name is empty", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.actions.rename({
      params: { id: "project-1" },
      request: form({ name: "", description: "anything" }),
      locals: {},
    } as Parameters<typeof mod.actions.rename>[0]) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };

    expect(result.status).toBe(400);
    expect(result.data?.form?.valid).toBe(false);
    expect(updates).toEqual([]);
  });

  test("delete action deletes through the service boundary and redirects", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let thrown: unknown;
    try {
      await mod.actions.delete({
        params: { id: "project-1" },
        locals: {},
      } as Parameters<typeof mod.actions.delete>[0]);
    } catch (error) {
      thrown = error;
    }

    expect(deleted).toEqual(["project-1"]);
    expect(redirectOf(thrown).status).toBe(303);
    expect(redirectOf(thrown).location).toBe("/projects");
  });
});
