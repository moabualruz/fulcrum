import { afterEach, describe, expect, it } from "bun:test";
import { run as runAgents } from "../../apps/cli/src/commands/agents.ts";
import { run as runSprintsCommand } from "../../apps/cli/src/commands/sprints.ts";
import { run as runSprintsLegacy } from "../../apps/cli/src/sprints.ts";
import { createTaskCsvApplication } from "@work-management/application/tasks/csv.ts";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  return {
    stdout,
    stderr,
    exits,
    opts: {
      print: (line: string) => stdout.push(line),
      printErr: (line: string) => stderr.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("agent command source", () => {
  // The CLI surface was renamed `agents`->`agent` and `profile`->`view`; the
  // command root and subcommand verbs below track the current contract.
  it("covers list/view/test/help/error paths", async () => {
    const a = io();
    await runAgents(["help"], a.opts);
    await runAgents(["list"], a.opts);
    await runAgents(["list", "--json"], a.opts);
    await runAgents(["view", "codex"], a.opts);
    await runAgents(["view", "codex", "--json"], a.opts);
    await runAgents(["view"], a.opts);
    await runAgents(["view", "missing", "--json"], a.opts);
    await runAgents(["test", "codex"], a.opts);
    await runAgents(["test"], a.opts);
    await runAgents(["test", "missing"], a.opts);
    await runAgents(["wat"], a.opts);

    const out = a.stdout.join("\n");
    expect(out).toContain("fulcrum agent <list|view|test>");
    expect(out).toContain("codex");
    expect(out).toContain("\"name\":\"codex\"");
    const err = a.stderr.join("\n");
    expect(err).toContain("agent view: missing <name>");
    expect(err).toContain("agent test: missing <name>");
    expect(err).toContain("unknown command 'wat'");
    expect(a.exits).toContain(2);
  });
});

describe("sprints command source", () => {
  function caller() {
    return {
      sprints: {
        list: async (input?: Record<string, unknown>) => [{ list: input }],
        get: async (input: unknown) => ({ get: input }),
        create: async (input: unknown) => ({ create: input }),
        update: async (input: unknown) => ({ update: input }),
        delete: async (input: unknown) => ({ delete: input }),
        addTask: async (input: unknown) => ({ addTask: input }),
        removeTask: async (input: unknown) => ({ removeTask: input }),
      },
    };
  }

  it("covers full sprints command CRUD and validation", async () => {
    const s = io();
    const opts = { caller: caller(), ...s.opts };
    await runSprintsCommand(["help"], opts);
    await runSprintsCommand(["list", "--project", "p1", "--status", "active"], opts);
    await runSprintsCommand(["get", "sp1"], opts);
    await runSprintsCommand(["create", "--project", "p1", "--name", "Sprint", "--start", "2026-05-01", "--end", "2026-05-14", "--capacity", "13"], opts);
    await runSprintsCommand(["update", "sp1", "--name", "Next", "--capacity", "8", "--json"], opts);
    await runSprintsCommand(["delete", "sp1"], opts);
    await runSprintsCommand(["add-task", "--sprint-id", "sp1", "--task-id", "t1"], opts);
    await runSprintsCommand(["remove-task", "--sprint-id", "sp1", "--task-id", "t1"], opts);
    await runSprintsCommand(["get"], opts);
    await runSprintsCommand(["create", "--project", "p1"], opts);
    await runSprintsCommand(["update", "sp1", "--capacity", "bad"], opts);
    await runSprintsCommand(["wat"], opts);

    const out = s.stdout.join("\n");
    expect(out).toContain("fulcrum sprints");
    expect(out).toContain("\"list\"");
    expect(out).toContain("\"create\"");
    expect(out).toContain("\"update\"");
    const err = s.stderr.join("\n");
    expect(err).toContain("missing required argument <id> for get");
    expect(err).toContain("missing required flag --name");
    expect(err).toContain("--capacity must be an integer");
    expect(err).toContain("unknown command 'wat'");
    expect(s.exits).toEqual([1, 1, 1, 2]);
  });

  it("routes hand-authored sprint commands through the configured public API", async () => {
    const s = io();
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const opts = {
      ...s.opts,
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210/",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url: String(url), method: init?.method, body });
        if (String(url).includes("/tasks/task-1")) return Response.json({ id: "assignment-1", taskId: "task-1" });
        if (String(url).endsWith("/tasks")) return Response.json({ id: "assignment-1", taskId: body?.taskId });
        if (init?.method === "POST") return Response.json({ id: "sprint-created" });
        if (init?.method === "PATCH") return Response.json({ id: "sprint-1", name: body?.name ?? "Sprint 1" });
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        if (String(url).includes("/sprint-1")) return Response.json({ id: "sprint-1", name: "Sprint 1" });
        return Response.json({ data: [{ id: "sprint-1" }] });
      }) as typeof fetch,
    };

    await runSprintsCommand(["list", "--project", "project-1", "--status", "active", "--json"], opts);
    await runSprintsCommand(["create", "--project", "project-1", "--name", "Sprint 1", "--start", "2026-05-01", "--end", "2026-05-14", "--json"], opts);
    await runSprintsCommand(["get", "sprint-1", "--json"], opts);
    await runSprintsCommand(["update", "sprint-1", "--name", "Sprint 1 revised", "--json"], opts);
    await runSprintsCommand(["add-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], opts);
    await runSprintsCommand(["remove-task", "--sprint-id", "sprint-1", "--task-id", "task-1", "--json"], opts);
    await runSprintsCommand(["delete", "sprint-1", "--json"], opts);

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://127.0.0.1:3210/api/v1/sprints?orgId=org-1&projectId=project-1&status=active"],
      ["POST", "http://127.0.0.1:3210/api/v1/sprints"],
      ["GET", "http://127.0.0.1:3210/api/v1/sprints/sprint-1?orgId=org-1"],
      ["PATCH", "http://127.0.0.1:3210/api/v1/sprints/sprint-1"],
      ["POST", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/sprints/sprint-1/tasks/task-1?orgId=org-1"],
      ["DELETE", "http://127.0.0.1:3210/api/v1/sprints/sprint-1?orgId=org-1"],
    ]);
    expect(calls[1]?.body).toMatchObject({ orgId: "org-1", projectId: "project-1", name: "Sprint 1" });
    expect(calls[3]?.body).toMatchObject({ orgId: "org-1", name: "Sprint 1 revised" });
    expect(calls[4]?.body).toMatchObject({ orgId: "org-1", taskId: "task-1" });
  });

  it("requires the configured sprint public API when no caller is injected", async () => {
    const s = io();
    await runSprintsCommand(["list", "--json"], {
      ...s.opts,
      env: {},
      fetch: (async () => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(s.exits).toEqual([1]);
    expect(s.stderr.join("\n")).toContain("Sprint API caller is not configured");
  });

  it("covers legacy sprint move command", async () => {
    const s = io();
    const opts = { caller: caller(), ...s.opts };
    await runSprintsLegacy(["help"], opts);
    await runSprintsLegacy(["add-task", "--sprint-id", "sp1", "--task-id", "t1"], opts);
    await runSprintsLegacy(["remove-task", "--sprint-id", "sp1", "--task-id", "t1", "--json"], opts);
    await runSprintsLegacy(["add-task"], opts);
    await runSprintsLegacy(["wat"], opts);

    expect(s.stdout.join("\n")).toContain("task t1 added to sprint sp1");
    expect(s.stdout.join("\n")).toContain("\"removeTask\"");
    expect(s.stderr.join("\n")).toContain("usage: fulcrum sprints add-task");
    expect(s.stderr.join("\n")).toContain("unknown verb 'wat'");
    expect(s.exits).toEqual([2, 2]);
  });
});

describe("task csv application", () => {
  it("imports, de-duplicates, and exports project-scoped CSV rows", async () => {
    const app = createTaskCsvApplication();
    const first = await app.importTasks({ projectId: "p1", csv: "external_id,title,status\nEXT-1,One,done\nEXT-2,Two,\n" });
    const second = await app.importTasks({ projectId: "p1", csv: "external_id,title,status\nEXT-1,Duplicate,todo\n" });
    await app.importTasks({ projectId: "p2", csv: "external_id,title,status\nEXT-1,Other,todo\n" });
    const exported = await app.exportTasks({ projectId: "p1" });

    expect(first.created).toBe(2);
    expect(second.skipped).toBe(1);
    expect(exported).toContain("EXT-1");
    expect(exported).toContain("EXT-2");
    expect(exported).not.toContain("Other");
  });
});
