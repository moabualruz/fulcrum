import { describe, expect, test } from "bun:test";
import type { RoutingRunOptions } from "@fulcrum/cli/commands/routing.ts";

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

type RoutingEnrichedDecision = {
  status: string;
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: Record<string, unknown>;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
};

type RoutingCaller = {
  routing: {
    list: (input?: Record<string, unknown>) => Promise<RoutingRule[]>;
    create: (input: Record<string, unknown>) => Promise<RoutingRule>;
    update: (input: Record<string, unknown>) => Promise<RoutingRule | null>;
    delete: (input: { id: string }) => Promise<{ ok: true }>;
    test: (input: { taskId: string }) => Promise<RoutingEnrichedDecision | null>;
    dryRun: (input: { taskJson: Record<string, unknown> }) => Promise<RoutingEnrichedDecision | null>;
    drafts: {
      list: (input?: Record<string, unknown>) => Promise<RoutingEnrichedDecision[]>;
      approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      update: (input: Record<string, unknown>) => Promise<{ ok: boolean }>;
    };
    config: {
      updateLlmGate: (input: Record<string, unknown>) => Promise<{ ok: boolean }>;
    };
  };
};

const RULE_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000010";
const TASK_ID = "00000000-0000-4000-8000-000000000020";

function envelopeResult(line: string): unknown {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  expect(parsed["schema"]).toBe("fulcrum.cli.v1");
  expect(typeof parsed["trace_id"]).toBe("string");
  return parsed["result"];
}

function envelopeErrors(line: string): unknown[] {
  const parsed = JSON.parse(line) as { schema: string; errors: unknown[] };
  expect(parsed.schema).toBe("fulcrum.cli.v1");
  return parsed.errors;
}

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

function fakeCaller(): RoutingCaller & { calls: Array<{ operation: string; input: unknown }> } {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const rows = [rule()];

  return {
    calls,
    routing: {
      list: async (input = {}) => {
        calls.push({ operation: "routing.list", input });
        return rows;
      },
      create: async (input) => {
        calls.push({ operation: "routing.create", input });
        return rule({
          id: "00000000-0000-4000-8000-000000000002",
          ...(input as Partial<RoutingRule>),
          conditionsJson: input.conditionsJson as Record<string, unknown>,
          actionAgent: String(input.actionAgent),
          name: String(input.name),
        });
      },
      update: async (input) => {
        calls.push({ operation: "routing.update", input });
        return rule(input as Partial<RoutingRule>);
      },
      delete: async (input) => {
        calls.push({ operation: "routing.delete", input });
        return { ok: true };
      },
      test: async (input) => {
        calls.push({ operation: "routing.test", input });
        return { status: "matched", matchedRuleId: RULE_ID, draftId: null, factsUsed: {}, confidence: 1, backend: null, model: null, whyUnmatched: null, evidence: ["matched"] };
      },
      dryRun: async (input) => {
        calls.push({ operation: "routing.dryRun", input });
        return { status: "matched", matchedRuleId: RULE_ID, draftId: null, factsUsed: {}, confidence: 1, backend: null, model: null, whyUnmatched: null, evidence: ["matched"] };
      },
      drafts: {
        list: async (input) => { calls.push({ operation: "routing.drafts.list", input }); return []; },
        approve: async (input) => { calls.push({ operation: "routing.drafts.approve", input }); return { ok: true }; },
        delete: async (input) => { calls.push({ operation: "routing.drafts.delete", input }); return { ok: true }; },
        update: async (input) => { calls.push({ operation: "routing.drafts.update", input }); return { ok: true }; },
      },
      config: {
        updateLlmGate: async (input) => { calls.push({ operation: "routing.config.updateLlmGate", input }); return { ok: true }; },
      },
    },
  };
}

async function runRouting(argv: readonly string[], caller = fakeCaller()) {
  return {
    caller,
    ...await runRoutingWithOptions(argv, { caller }),
  };
}

async function runRoutingWithOptions(
  argv: readonly string[],
  options: RoutingRunOptions = {},
) {
  const { run } = await import("@fulcrum/cli/commands/routing.ts");
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  await run(argv, {
    ...options,
    print: (line: string) => stdout.push(line),
    printErr: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  });

  return { stdout, stderr, exitCode };
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
      operation: "routing.list",
      input: { projectId: PROJECT_ID },
    });
    const parsed = envelopeResult(stdout[0]!) as RoutingRule[];
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
      operation: "routing.create",
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
      operation: "routing.update",
      input: { id: RULE_ID, name: "Renamed", actionAgent: "codex", enabled: false },
    });
    expect((envelopeResult(stdout[0]!) as RoutingRule).name).toBe("Renamed");
  });

  test("delete calls routing.delete and prints confirmation", async () => {
    const { caller, stdout, exitCode } = await runRouting(["rules", "delete", RULE_ID]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      operation: "routing.delete",
      input: { id: RULE_ID },
    });
    expect(stdout.join("\n")).toContain(`Deleted routing rule ${RULE_ID}.`);
  });

  test("assign maps to routing.test and prints enriched decision", async () => {
    const { caller, stdout, exitCode } = await runRouting(["assign", TASK_ID]);

    expect(exitCode).toBeUndefined();
    expect(caller.calls[0]).toEqual({
      operation: "routing.test",
      input: { taskId: TASK_ID },
    });
    expect(stdout.join("\n")).toContain("status: matched");
    expect(stdout.join("\n")).toContain("confidence: 1");
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
      operation: "routing.dryRun",
      input: { taskJson: { title: "Fix auth", kind: "bug", priority: "high", tags: ["auth"] } },
    });
    const parsed = envelopeResult(stdout[0]!) as RoutingEnrichedDecision;
    expect(parsed.status).toBe("matched");
    expect(parsed.matchedRuleId).toBe(RULE_ID);
  });

  test("invalid conditions JSON exits before API call", async () => {
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

  test("routes through the routing public API when no caller is injected", async () => {
    const decision = {
      status: "matched",
      matchedRuleId: RULE_ID,
      draftId: null,
      factsUsed: {},
      confidence: 1,
      backend: null,
      model: null,
      whyUnmatched: null,
      evidence: ["matched"],
    };
    const requests: Array<[string, string, unknown?]> = [];
    const fetchFn = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push([method, url, body]);

      if (url.includes("/api/v1/routing/rules?")) return Response.json([rule()]);
      if (url.includes("/api/v1/routing/test")) return Response.json(decision);
      return Response.json({ ok: true });
    }) as typeof fetch;
    const options: RoutingRunOptions = {
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_ORG_ID: "org-1",
        FULCRUM_USER_ID: "user-1",
      },
      fetch: fetchFn,
    };

    const list = await runRoutingWithOptions(["rules", "list", "--project", PROJECT_ID, "--json"], options);
    const assign = await runRoutingWithOptions(["assign", TASK_ID, "--json"], options);
    const approve = await runRoutingWithOptions(["drafts", "approve", "draft-1", "--json"], options);
    const gate = await runRoutingWithOptions(["llm-gate", "set", "--input-mode", "task_facts", "--enabled", "true", "--json"], options);

    expect([list, assign, approve, gate].every((result) => result.exitCode === undefined)).toBe(true);
    expect((envelopeResult(list.stdout[0] as string) as RoutingRule[])[0]!.id).toBe(RULE_ID);
    expect(envelopeResult(assign.stdout[0] as string)).toMatchObject({ status: "matched", matchedRuleId: RULE_ID });
    expect(envelopeResult(approve.stdout[0] as string)).toEqual({ ok: true });
    expect(envelopeResult(gate.stdout[0] as string)).toEqual({ ok: true });
    expect(requests).toEqual([
      ["GET", `http://127.0.0.1:3210/api/v1/routing/rules?orgId=org-1&userId=user-1&projectId=${PROJECT_ID}`, undefined],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/test", { orgId: "org-1", userId: "user-1", taskId: TASK_ID }],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/drafts/draft-1/approve", { orgId: "org-1", userId: "user-1" }],
      ["POST", "http://127.0.0.1:3210/api/v1/routing/config/llm-gate", { orgId: "org-1", userId: "user-1", inputMode: "task_facts", enabled: true }],
    ]);
  });

  test("requires the routing public API when no caller is injected", async () => {
    const result = await runRoutingWithOptions(["rules", "list", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([]);
    expect(JSON.stringify(envelopeErrors(result.stdout[0] as string))).toContain("Routing API caller is not configured");
  });
});
