import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
const board = {
  sprints: [{ id: "sprint-1", name: "Sprint 1", status: "planning", capacity_points: 20 }],
  velocity: [],
};

// The route's project-existence guard reads `projects.overview` through the
// project public API; that seam is driven by a fake `event.fetch` — no
// `mock.module("$lib/server/project-api")`, so sibling settings suites that
// import the real module are never hijacked. The sprint public API is a
// route-specific seam and stays mocked.
mock.module("$lib/server/sprint-api", () => ({
  createSprintApiForEvent: () => ({
    sprints: {
      loadProjectSprints: async (input: { projectId: string }) => {
        calls.push(`load:${input.projectId}`);
        return board;
      },
      createProjectSprint: async (input: { name: string; capacity?: number | null }) => {
        calls.push(`create:${input.name}:${input.capacity ?? ""}`);
        return { id: "sprint-new" };
      },
      startProjectSprint: async (input: { id: string }) => {
        calls.push(`start:${input.id}`);
        return { ok: true };
      },
      completeProjectSprint: async (input: { id: string }) => {
        calls.push(`complete:${input.id}`);
        return { id: input.id, metrics: { velocity: 3, completed_tasks: 2 } };
      },
    },
  }),
}));

// Fake project public API: `GET /api/v1/projects/:id/overview` answers the
// `projects.overview` call inside the route's `ensureProject` guard. Records
// the call for assertions.
function fetchProject(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // api v1 projects :id overview
    if (parts.length === 5 && parts[2] === "projects" && parts[4] === "overview" && method === "GET") {
      calls.push(`overview:${decodeURIComponent(parts[3]!)}`);
      return Response.json({ id: decodeURIComponent(parts[3]!), name: "Project" });
    }
    return Response.json({ message: `unexpected ${method} ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls.splice(0, calls.length);
  delete process.env["FULCRUM_FEATURES"];
});

function event(method: "GET" | "POST", projectId: string, data: Record<string, string> = {}) {
  const url = new URL(`http://localhost/projects/${projectId}/sprints`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    url,
    params: { id: projectId },
    locals: { orgId: "org-1", userId: "user-1" },
    fetch: fetchProject(),
    request: new Request(url, method === "POST" ? { method, body: fd } : { method }),
  } as unknown as Parameters<typeof import("./+page.server.ts").load>[0];
}

describe("/projects/[id]/sprints +page.server.ts", () => {
  test("server route uses the sprint public API instead of direct application scope", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("$lib/server/sprint-api");
    expect(source).not.toContain("project-request-scope");
    expect(source).not.toContain("@work-management/interface/project-sprints");
    expect(source).not.toContain("EntityManager");
  });

  test("load returns sprints and velocity data after guarding the project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event("GET", "project-1"));
    expect(result.projectId).toBe("project-1");
    const data = await result.streamed.data;
    expect(data.sprints[0]?.name).toBe("Sprint 1");
    expect(data.velocity).toEqual([]);
    expect(calls).toContain("overview:project-1");
    expect(calls).toContain("load:project-1");
  });

  test("createSprint action creates a new sprint through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.createSprint(
      event("POST", "project-1", { name: "Sprint 2", capacity: "30" }),
    );
    expect(result).toEqual({ ok: true, message: "Sprint created" });
    expect(calls).toEqual(["create:Sprint 2:30"]);
  });

  test("startSprint and completeSprint actions call the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const start = await mod.actions.startSprint(event("POST", "project-1", { id: "sprint-1" }));
    const complete = await mod.actions.completeSprint(event("POST", "project-1", { id: "sprint-1" }));

    expect(start).toEqual({ ok: true, message: "Sprint started" });
    expect(complete).toEqual({ ok: true, message: "Sprint completed" });
    expect(calls).toEqual(["start:sprint-1", "complete:sprint-1"]);
  });
});
