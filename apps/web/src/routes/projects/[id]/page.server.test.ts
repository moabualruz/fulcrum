import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { ProjectApiError } from "@work-management/interface/http/project-api-client";

// The route delegates to the project public API (`createProjectApiForEvent`).
// Mocking that seam keeps this a unit test: no TypeORM EntityManager, no
// request service scope, no database seeding.
const calls: Array<{ method: string; input: unknown }> = [];
const updates: Array<{ id: string; name?: string; description?: string | null }> = [];
const deleted: string[] = [];
let overview: {
  project: { id: string; slug: string; name: string; description: string | null; updated_at: string };
  summary: { openTasks: number; inProgress: number; done: number; sprintDaysRemaining: number };
} | null = null;

mock.module("$lib/server/project-api", () => ({
  createProjectApiForEvent: () => ({
    projects: {
      overview: async (input: { id: string }) => {
        calls.push({ method: "projects.overview", input });
        // The real client throws `ProjectApiError(404)` for an unknown id;
        // mirror that so the route's `instanceof` 404 mapping is exercised.
        if (overview === null) throw new ProjectApiError("Project not found", 404);
        return overview;
      },
      update: async (input: { id: string; name?: string; description?: string | null }) => {
        calls.push({ method: "projects.update", input });
        updates.push(input);
        return { ok: true };
      },
      delete: async (input: { id: string }) => {
        calls.push({ method: "projects.delete", input });
        deleted.push(input.id);
        return { ok: true };
      },
    },
  }),
}));

function form(data: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return new Request("http://localhost/projects/project-1", { method: "POST", body: fd });
}

function redirectOf(value: unknown): { status?: number; location?: string } {
  return value as { status?: number; location?: string };
}

function loadEvent(id: string, parent?: () => Promise<{ activeProjectId: string | null }>) {
  const url = new URL(`http://localhost/projects/${id}`);
  return { params: { id }, parent, url, locals: {}, request: new Request(url), fetch };
}

beforeEach(() => {
  calls.splice(0, calls.length);
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
    summary: { openTasks: 2, inProgress: 1, done: 1, sprintDaysRemaining: 0 },
  };
});

describe("/projects/[id] +page.server.ts", () => {
  test("server route uses the project public API instead of request service scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("createProjectApiForEvent");
    expect(source).not.toContain("requestServiceScope");
    expect(source).not.toContain("$lib/server/application-scope");
    expect(source).not.toContain("@work-management/application/projects");
  });

  test("load returns project summary and a rename form", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(
      loadEvent("project-1", async () => ({ activeProjectId: "project-1" })) as Parameters<typeof mod.load>[0],
    );

    expect(result.project.id).toBe("project-1");
    expect(result.project.slug).toBe("alpha");
    expect(result.summary).toEqual({ openTasks: 2, inProgress: 1, done: 1, sprintDaysRemaining: 0 });
    expect(result.form?.data?.name).toBe("Alpha");
    expect(result.form?.data?.description).toBe("first project");
    expect(result.activeProjectId).toBe("project-1");
    expect(calls).toEqual([{ method: "projects.overview", input: { id: "project-1" } }]);
  });

  test("load throws 404 when the project public API reports the id is missing", async () => {
    overview = null;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(
      mod.load(loadEvent("missing-project") as Parameters<typeof mod.load>[0]),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual([{ method: "projects.overview", input: { id: "missing-project" } }]);
  });

  test("rename action validates and updates through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.rename({
      params: { id: "project-1" },
      request: form({ name: "NewName", description: "after" }),
      locals: {},
    } as Parameters<typeof mod.actions.rename>[0]);

    expect((result as { form?: unknown }).form).toBeDefined();
    expect(updates).toEqual([{ id: "project-1", name: "NewName", description: "after" }]);
    expect(calls).toEqual([
      { method: "projects.update", input: { id: "project-1", name: "NewName", description: "after" } },
    ]);
  });

  test("rename action returns fail(400, { form }) when name is empty and skips the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = (await mod.actions.rename({
      params: { id: "project-1" },
      request: form({ name: "", description: "anything" }),
      locals: {},
    } as Parameters<typeof mod.actions.rename>[0])) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };

    expect(result.status).toBe(400);
    expect(result.data?.form?.valid).toBe(false);
    expect(updates).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("delete action deletes through the public API and redirects", async () => {
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
    expect(calls).toEqual([{ method: "projects.delete", input: { id: "project-1" } }]);
    expect(redirectOf(thrown).status).toBe(303);
    expect(redirectOf(thrown).location).toBe("/projects");
  });
});
