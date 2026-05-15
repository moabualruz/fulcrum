import { describe, expect, test } from "bun:test";

import { fetchCommandPaletteEntities } from "./entity-api.ts";

describe("command palette public entity API", () => {
  test("loads tasks, projects, and per-project sprints through public APIs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const entities = await fetchCommandPaletteEntities(
      async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes("/api/trpc")) throw new Error("unexpected legacy route call");
        calls.push({ url: target, init: init ?? {} });
        if (target.startsWith("/api/v1/tasks")) {
          return Response.json({
            data: [
              {
                id: "task-1",
                title: "Review plan",
                externalId: "FUL-42",
                projectId: "project-1",
              },
            ],
          });
        }
        if (target.startsWith("/api/v1/projects")) {
          return Response.json({
            data: [
              { id: "project-1", name: "Fulcrum" },
              { id: "project-2", name: "Integrations" },
            ],
          });
        }
        if (target.includes("projectId=project-1")) {
          return Response.json({ data: [{ id: "sprint-1", name: "Alpha", projectId: "project-1" }] });
        }
        return Response.json({ data: [] });
      },
      { orgId: "org-1", userId: "user-1" },
    );

    expect(entities).toEqual({
      tasks: [{ id: "task-1", title: "Review plan", identifier: "FUL-42", projectId: "project-1" }],
      projects: [
        { id: "project-1", name: "Fulcrum" },
        { id: "project-2", name: "Integrations" },
      ],
      sprints: [{ id: "sprint-1", name: "Alpha", projectId: "project-1" }],
    });
    expect(calls.map((call) => call.url).sort()).toEqual([
      "/api/v1/projects?orgId=org-1",
      "/api/v1/sprints?orgId=org-1&projectId=project-1",
      "/api/v1/sprints?orgId=org-1&projectId=project-2",
      "/api/v1/tasks?orgId=org-1&userId=user-1",
    ].sort());
    for (const call of calls) {
      expect(call.init).toMatchObject({
        method: "GET",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
    }
  });

  test("stays as navigation-only data when organization or user scope is absent", async () => {
    const entities = await fetchCommandPaletteEntities(
      async () => {
        throw new Error("fetch should not be called without scope");
      },
      { orgId: "org-1" },
    );

    expect(entities).toEqual({ tasks: [], projects: [], sprints: [] });
  });
});
