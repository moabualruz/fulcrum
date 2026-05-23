import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type LoadResult = {
  activeProjectId: string | null;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  streamed: {
    options: Promise<unknown>;
    bundle: Promise<unknown> | null;
  };
};

const calls: Array<{ method: string; input: unknown }> = [];

mock.module("$lib/server/context-preview-api", () => ({
  createContextPreviewApiForEvent: () => ({
    options: async (selectedProjectId: string | null) => {
      calls.push({ method: "options", input: selectedProjectId });
      return {
        projects: [{ id: "project-1", name: "Project 1" }],
        tasks: selectedProjectId ? [{ id: "task-1", title: "Task 1", status: "ready" }] : [],
      };
    },
    bundle: async (input: unknown) => {
      calls.push({ method: "bundle", input });
      return {
        documents: [],
        memories: [],
        recentRuns: [],
        artifacts: [],
        tokenBudget: { used: 0, total: 8000 },
        input,
      };
    },
  }),
}));

// The loader resolves the active project slug → UUID before fetching task
// options. Stub fetch on the load() event so the project-api caller returns a
// stable list without registering a process-global `mock.module` (which would
// contaminate sibling test files via Bun's shared module cache).
const stubProjectsFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/v1/projects")) {
    return Response.json({ data: [{ id: "project-1", slug: "project-1", name: "Project 1" }] });
  }
  return Response.json({ error: `unexpected ${url}` }, { status: 500 });
}) as typeof fetch;

beforeEach(() => {
  calls.splice(0, calls.length);
});

afterEach(() => {
  calls.splice(0, calls.length);
});

describe("/context/preview +page.server.ts load()", () => {
  test("loads preview options and selected task bundle through the context preview public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/context/preview?projectId=project-1&taskId=task-1"),
      locals: { activeProjectId: null, orgId: "org-1", userId: "user-1" },
      fetch: stubProjectsFetch,
      request: new Request("http://localhost/context/preview"),
    } as Parameters<typeof mod.load>[0]) as LoadResult;

    expect(result.activeProjectId).toBeNull();
    expect(result.selectedProjectId).toBe("project-1");
    expect(result.selectedTaskId).toBe("task-1");
    await expect(result.streamed.options).resolves.toEqual({
      projects: [{ id: "project-1", name: "Project 1" }],
      tasks: [{ id: "task-1", title: "Task 1", status: "ready" }],
    });
    await expect(result.streamed.bundle).resolves.toMatchObject({
      input: { selectedProjectId: "project-1", selectedTaskId: "task-1" },
    });
    // options + bundle are awaited concurrently in the streamed payload, so
    // order between them is not guaranteed — just assert both calls happened.
    expect(calls).toContainEqual({ method: "options", input: "project-1" });
    expect(calls).toContainEqual({
      method: "bundle",
      input: { selectedProjectId: "project-1", selectedTaskId: "task-1" },
    });
  });

  test("does not request a bundle when no task is selected", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url: new URL("http://localhost/context/preview"),
      locals: { activeProjectId: "project-1", orgId: "org-1", userId: "user-1" },
      fetch: stubProjectsFetch,
      request: new Request("http://localhost/context/preview"),
    } as Parameters<typeof mod.load>[0]) as LoadResult;

    expect(result.activeProjectId).toBe("project-1");
    expect(result.selectedProjectId).toBe("project-1");
    expect(result.selectedTaskId).toBeNull();
    await expect(result.streamed.options).resolves.toMatchObject({
      projects: [{ id: "project-1", name: "Project 1" }],
    });
    expect(result.streamed.bundle).toBeNull();
    expect(calls).toEqual([{ method: "options", input: "project-1" }]);
  });
});
