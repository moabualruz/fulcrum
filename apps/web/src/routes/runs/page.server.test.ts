import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input: Record<string, unknown> }> = [];

const runRows = [
  {
    id: "run-claude",
    agent: "claude",
    model: "claude-sonnet",
    status: "succeeded",
    project_id: "project-1",
    started_at: "2026-04-30T10:00:00.000Z",
    ended_at: "2026-04-30T10:05:00.000Z",
  },
  {
    id: "run-codex",
    agent: "codex",
    model: "gpt-5",
    status: "running",
    project_id: null,
    started_at: "2026-04-30T11:00:00.000Z",
    ended_at: null,
  },
];

mock.module("$lib/server/agent-run-api", () => ({
  createAgentRunApiForEvent: () => ({
    runs: {
      pageData: async (input: Record<string, unknown>) => {
        calls.push({ method: "pageData", input });
        let runs = [...runRows];
        if (input.filterProjectId === "00000000-0000-0000-0000-000000000000") runs = [];
        if (input.agent) runs = runs.filter((run) => run.agent === input.agent);
        if (input.status) runs = runs.filter((run) => run.status === input.status);
        return { runs, projects: [{ id: "project-1", name: "Alpha" }], tasks: [] };
      },
      dispatchPrompt: async (input: Record<string, unknown>) => {
        calls.push({ method: "dispatchPrompt", input });
        return { id: "run-dispatched" };
      },
    },
  }),
}));

interface RunsPayload {
  runs: Array<{
    id: string;
    agent: string;
    model: string | null;
    status: string;
    project_id: string | null;
    started_at: string;
    ended_at: string | null;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function loadEvent(url: string, locals: Record<string, unknown> = { activeProjectId: null }) {
  return {
    url: new URL(url),
    locals,
    request: new Request(url),
    fetch,
  };
}

function formEvent(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return {
    url: new URL("http://localhost/runs"),
    locals: { activeProjectId: null },
    request: new Request("http://localhost/runs?/dispatch", { method: "POST", body: fd }),
    fetch,
  };
}

describe("/runs +page.server.ts load()", () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
  });

  test("returns runs unfiltered", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent("http://localhost/runs") as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(2);
    expect(payload.runs.map((run) => run.id)).toEqual(["run-claude", "run-codex"]);
    expect(result.filter).toMatchObject({
      agent: "",
      status: "",
      range: "all",
      project: "__any__",
    });
    expect(calls).toEqual([
      { method: "pageData", input: { contextProjectId: null, hasProjectFilter: undefined, filterProjectId: undefined, range: "all" } },
    ]);
  });

  test("project filter narrows to matching project", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 9}`);
    const result = await mod.load(
      loadEvent("http://localhost/runs?project=00000000-0000-0000-0000-000000000000") as Parameters<typeof mod.load>[0],
    );
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
    expect(result.filter.project).toBe("00000000-0000-0000-0000-000000000000");
    expect(calls[0]).toEqual({
      method: "pageData",
      input: {
        contextProjectId: "00000000-0000-0000-0000-000000000000",
        hasProjectFilter: "true",
        filterProjectId: "00000000-0000-0000-0000-000000000000",
        range: "all",
      },
    });
  });

  test("agent filter narrows to matching agent", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(loadEvent("http://localhost/runs?agent=claude") as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.agent).toBe("claude");
    expect(result.filter.agent).toBe("claude");
    expect(calls[0]?.input).toMatchObject({ agent: "claude", range: "all" });
  });

  test("status filter narrows to matching status", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(loadEvent("http://localhost/runs?status=running") as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.status).toBe("running");
    expect(calls[0]?.input).toMatchObject({ status: "running", range: "all" });
  });

  test("returns empty array when API has no runs", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(
      loadEvent("http://localhost/runs?project=00000000-0000-0000-0000-000000000000") as Parameters<typeof mod.load>[0],
    );
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
  });

  test("dispatch action delegates to the run API and redirects", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let caught: unknown;
    try {
      await mod.actions.dispatch(
        formEvent({ taskId: "task-1", projectId: "project-1", agent: "codex" }) as Parameters<typeof mod.actions.dispatch>[0],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ status: 303, location: "/runs/run-dispatched" });
    expect(calls).toEqual([
      { method: "dispatchPrompt", input: { projectId: "project-1", agentName: "codex", prompt: "task-1" } },
    ]);
  });
});
