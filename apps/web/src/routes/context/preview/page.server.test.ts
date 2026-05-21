import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

import { applicationScopeMock, useApplicationScope } from "$lib/test/application-scope-mock";
import { contextQueriesMock, useContextQueries } from "$lib/test/context-queries-mock";

type LoadResult = {
  activeProjectId: string | null;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  streamed: {
    options: Promise<unknown>;
    bundle: Promise<unknown> | null;
  };
};

// `mock.module` is process-wide and only one factory closure survives per
// path. Both factories route through a shared slot; this suite publishes its
// seam/overrides while active (beforeAll/afterAll) so sibling suites that mock
// the same paths are never hijacked. In particular `context/queries.ts` keeps
// a complete export set — `previewContext` stays defined for foreign suites
// (`/runs/[id]` pulls it in transitively) instead of being frozen out.
mock.module("$lib/server/application-scope", () => applicationScopeMock());
mock.module("@knowledge-workspace/application/context/queries.ts", () => contextQueriesMock());

describe("/context/preview +page.server.ts load()", () => {
  let disposeScope: (() => void) | undefined;
  let disposeQueries: (() => void) | undefined;
  beforeAll(() => {
    disposeScope = useApplicationScope((_locals, projectId) => ({
      em: { marker: "em" },
      ctx: { orgId: "org1", userId: "user1", projectId: projectId ?? null },
    }));
    disposeQueries = useContextQueries({
      loadContextPreviewOptions: async (_em: unknown, _ctx: unknown, selectedProjectId: string | null) => ({
        projects: [{ id: "project-1", name: "Project 1" }],
        tasks: selectedProjectId ? [{ id: "task-1", title: "Task 1", status: "ready" }] : [],
      }),
      loadContextBundle: async (_em: unknown, _ctx: unknown, input: unknown) => ({
        documents: [],
        memories: [],
        recentRuns: [],
        artifacts: [],
        tokenBudget: { used: 0, total: 8000 },
        input,
      }),
    });
  });
  afterAll(() => {
    disposeScope?.();
    disposeQueries?.();
  });

  test("loads preview options and selected task bundle from application services", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/context/preview?projectId=project-1&taskId=task-1"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]) as LoadResult;

    expect(result.selectedProjectId).toBe("project-1");
    expect(result.selectedTaskId).toBe("task-1");
    await expect(result.streamed.options).resolves.toEqual({
      projects: [{ id: "project-1", name: "Project 1" }],
      tasks: [{ id: "task-1", title: "Task 1", status: "ready" }],
    });
    await expect(result.streamed.bundle).resolves.toMatchObject({
      input: { selectedProjectId: "project-1", selectedTaskId: "task-1" },
    });
  });

  test("does not request a bundle when no task is selected", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url: new URL("http://localhost/context/preview"),
      locals: { activeProjectId: "project-1" },
    } as Parameters<typeof mod.load>[0]) as LoadResult;

    expect(result.selectedProjectId).toBe("project-1");
    expect(result.selectedTaskId).toBeNull();
    expect(result.streamed.bundle).toBeNull();
  });
});
