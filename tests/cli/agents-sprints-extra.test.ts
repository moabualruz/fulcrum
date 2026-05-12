import { afterEach, describe, expect, it } from "bun:test";
import { run as runAgents } from "../../apps/cli/src/commands/agents.ts";
import { run as runSprintsCommand } from "../../apps/cli/src/commands/sprints.ts";
import { run as runSprintsLegacy } from "../../apps/cli/src/sprints.ts";
import { createTaskCsvApplication } from "../../src/application/tasks/csv.ts";

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

describe("agents command source", () => {
  it("covers list/profile/test/help/error paths", async () => {
    const a = io();
    await runAgents(["help"], a.opts);
    await runAgents(["list"], a.opts);
    await runAgents(["list", "--json"], a.opts);
    await runAgents(["profile", "codex"], a.opts);
    await runAgents(["profile", "codex", "--json"], a.opts);
    await runAgents(["profile"], a.opts);
    await runAgents(["profile", "missing", "--json"], a.opts);
    await runAgents(["test", "codex"], a.opts);
    await runAgents(["test"], a.opts);
    await runAgents(["test", "missing"], a.opts);
    await runAgents(["wat"], a.opts);

    const out = a.stdout.join("\n");
    expect(out).toContain("fulcrum agents <list|profile|test>");
    expect(out).toContain("codex");
    expect(out).toContain("\"name\":\"codex\"");
    const err = a.stderr.join("\n");
    expect(err).toContain("agents profile: missing <name>");
    expect(err).toContain("agents test: missing <name>");
    expect(err).toContain("unknown command 'wat'");
    expect(a.exits).toContain(2);
  });
});

describe("sprints command source", () => {
  function caller() {
    return {
      sprints: {
        list: async (input?: Record<string, unknown>) => ({ list: input }),
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
