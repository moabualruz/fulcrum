import { describe, expect, test } from "bun:test";

type RoutingRule = {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: "manual" | "learned" | "imported";
  createdAt: string;
  updatedAt: string;
};

type RoutingDecision = {
  ruleId: string | null;
  source: "explicit" | "rule" | "learned" | "llm-fallback" | "manual";
  agent: string;
  confidence: number | null;
};

type RoutingCaller = {
  routing: {
    list: (input?: Record<string, unknown>) => Promise<RoutingRule[]>;
    create: (input: Record<string, unknown>) => Promise<RoutingRule>;
    update: (input: Record<string, unknown>) => Promise<RoutingRule | null>;
    delete: (input: { id: string }) => Promise<{ ok: true }>;
    test: (input: { taskId: string }) => Promise<RoutingDecision | null>;
    dryRun: (input: { taskJson: Record<string, unknown> }) => Promise<RoutingDecision | null>;
  };
};

const RULE_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000010";
const TASK_ID = "00000000-0000-4000-8000-000000000020";

function rule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: RULE_ID,
    orgId: "00000000-0000-4000-8000-000000000100",
    projectId: null,
    name: "Bug triage",
    conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
    actionAgent: "codex",
    actionSkillSet: ["triage"],
    priority: 25,
    enabled: true,
    source: "manual",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

function fakeCaller(): RoutingCaller & { calls: Array<{ procedure: string; input: unknown }> } {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  const rows = [rule()];

  return {
    calls,
    routing: {
      list: async (input = {}) => {
        calls.push({ procedure: "routing.list", input });
        return rows;
      },
      create: async (input) => {
        calls.push({ procedure: "routing.create", input });
        return rule({
          id: "00000000-0000-4000-8000-000000000002",
          ...(input as Partial<RoutingRule>),
          conditionsJson: input.conditionsJson as Record<string, unknown>,
          actionAgent: String(input.actionAgent),
          name: String(input.name),
        });
      },
      update: async (input) => {
        calls.push({ procedure: "routing.update", input });
        return rule(input as Partial<RoutingRule>);
      },
      delete: async (input) => {
        calls.push({ procedure: "routing.delete", input });
        return { ok: true };
      },
      test: async (input) => {
        calls.push({ procedure: "routing.test", input });
        return { ruleId: RULE_ID, source: "rule", agent: "codex", confidence: 1 };
      },
      dryRun: async (input) => {
        calls.push({ procedure: "routing.dryRun", input });
        return { ruleId: RULE_ID, source: "rule", agent: "codex", confidence: 1 };
      },
    },
  };
}

async function runRouting(argv: readonly string[], caller = fakeCaller()) {
  const { run } = await import("../../src/cli/commands/routing.ts");
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  await run(argv, {
    caller,
    print: (line: string) => stdout.push(line),
    printErr: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  });

  return { caller, stdout, stderr, exitCode };
}

describe("routing rules CLI", () => {
  test("list --json calls routing.list and prints RoutingRule array", async () => {
    const { caller, stdout, exitCode } = await runRouting([
      "rules",
      "list",
      "--project",
      PROJECT_ID,
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.list",
      input: { projectId: PROJECT_ID },
    });
    const parsed = JSON.parse(stdout[0]!) as RoutingRule[];
    expect(parsed[0]).toMatchObject({
      id: RULE_ID,
      name: "Bug triage",
      conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      actionAgent: "codex",
      source: "manual",
    });
  });

  test("add parses conditions JSON and prints created rule id", async () => {
    const conditions = JSON.stringify({ all: [{ fact: "task.priority", operator: "equal", value: "high" }] });
    const { caller, stdout, exitCode } = await runRouting([
      "rules",
      "add",
      "--name",
      "High priority",
      "--agent",
      "claude-code",
      "--conditions",
      conditions,
      "--project",
      PROJECT_ID,
      "--skill",
      "triage",
      "--priority",
      "10",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.create",
      input: {
        name: "High priority",
        actionAgent: "claude-code",
        conditionsJson: { all: [{ fact: "task.priority", operator: "equal", value: "high" }] },
        projectId: PROJECT_ID,
        actionSkillSet: ["triage"],
        priority: 10,
      },
    });
    expect(stdout.join("\n")).toContain("00000000-0000-4000-8000-000000000002");
  });

  test("edit maps to routing.update", async () => {
    const { caller, stdout, exitCode } = await runRouting([
      "rules",
      "edit",
      RULE_ID,
      "--name",
      "Renamed",
      "--agent",
      "codex",
      "--enabled",
      "false",
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.update",
      input: { id: RULE_ID, name: "Renamed", actionAgent: "codex", enabled: false },
    });
    expect(JSON.parse(stdout[0]!).name).toBe("Renamed");
  });

  test("delete calls routing.delete and prints confirmation", async () => {
    const { caller, stdout, exitCode } = await runRouting(["rules", "delete", RULE_ID]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.delete",
      input: { id: RULE_ID },
    });
    expect(stdout.join("\n")).toContain(`Deleted routing rule ${RULE_ID}.`);
  });

  test("assign maps to routing.test and prints decision", async () => {
    const { caller, stdout, exitCode } = await runRouting(["assign", TASK_ID]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.test",
      input: { taskId: TASK_ID },
    });
    expect(stdout.join("\n")).toContain("agent: codex");
    expect(stdout.join("\n")).toContain("source: rule");
  });

  test("simulate maps to routing.dryRun and prints JSON decision", async () => {
    const taskJson = JSON.stringify({ title: "Fix auth", kind: "bug", priority: "high", tags: ["auth"] });
    const { caller, stdout, exitCode } = await runRouting([
      "simulate",
      "--task-json",
      taskJson,
      "--json",
    ]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      procedure: "routing.dryRun",
      input: { taskJson: { title: "Fix auth", kind: "bug", priority: "high", tags: ["auth"] } },
    });
    expect(JSON.parse(stdout[0]!).agent).toBe("codex");
  });

  test("invalid conditions JSON exits before tRPC call", async () => {
    const caller = fakeCaller();
    const { stderr, exitCode } = await runRouting([
      "rules",
      "create",
      "--name",
      "Broken",
      "--agent",
      "codex",
      "--conditions",
      "{not-json",
    ], caller);

    expect(exitCode).toBe(1);
    expect(caller.calls).toHaveLength(0);
    expect(stderr.join("\n")).toContain("invalid --conditions JSON");
  });
});
