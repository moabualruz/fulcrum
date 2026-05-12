import { describe, expect, test } from "bun:test";

import { Renderer } from "@fulcrum/tui/renderer.ts";
import {
  RoutingRulesScreen,
  type RoutingRuleFormInput,
  type RoutingRulesScreenOptions,
  type TuiEnrichedDecision,
  type TuiRoutingRule,
} from "@fulcrum/tui/screens/routing-rules.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 140, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

const RULE_ID = "00000000-0000-4000-8000-000000000001";

function rule(overrides: Partial<TuiRoutingRule> = {}): TuiRoutingRule {
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

function decision(overrides: Partial<TuiEnrichedDecision> = {}): TuiEnrichedDecision {
  return {
    status: "matched",
    matchedRuleId: RULE_ID,
    draftId: null,
    factsUsed: {},
    confidence: 1,
    backend: null,
    model: null,
    whyUnmatched: null,
    evidence: [],
    ...overrides,
  };
}

function fakeCaller(seedDrafts: TuiEnrichedDecision[] = []): RoutingRulesScreenOptions["caller"] & { calls: Array<{ procedure: string; input: unknown }> } {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  const rows = [rule()];
  const drafts = [...seedDrafts];

  return {
    calls,
    routing: {
      list: async (input = {}) => {
        calls.push({ procedure: "routing.list", input });
        return rows;
      },
      create: async (input: Omit<RoutingRuleFormInput, "id">) => {
        calls.push({ procedure: "routing.create", input });
        const created = rule({
          id: "00000000-0000-4000-8000-000000000002",
          name: input.name ?? "Untitled rule",
          projectId: input.projectId ?? null,
          conditionsJson: input.conditionsJson ?? {},
          actionAgent: input.actionAgent ?? "codex",
          actionSkillSet: input.actionSkillSet ?? [],
          priority: input.priority ?? 100,
          enabled: input.enabled ?? true,
        });
        rows.unshift(created);
        return created;
      },
      update: async (input: Partial<TuiRoutingRule> & { id: string }) => {
        calls.push({ procedure: "routing.update", input });
        const index = rows.findIndex((row) => row.id === input.id);
        if (index === -1) return null;
        rows[index] = { ...rows[index]!, ...input };
        return rows[index]!;
      },
      delete: async (input: { id: string }) => {
        calls.push({ procedure: "routing.delete", input });
        const index = rows.findIndex((row) => row.id === input.id);
        if (index >= 0) rows.splice(index, 1);
        return { ok: true as const };
      },
      test: async (input: { taskId: string }) => {
        calls.push({ procedure: "routing.test", input });
        return decision();
      },
      dryRun: async (input: { taskJson: Record<string, unknown> }) => {
        calls.push({ procedure: "routing.dryRun", input });
        return decision();
      },
      drafts: {
        list: async () => { calls.push({ procedure: "routing.drafts.list", input: {} }); return drafts; },
        approve: async (input: { draftId: string }) => {
          calls.push({ procedure: "routing.drafts.approve", input });
          const index = drafts.findIndex((draft) => draft.draftId === input.draftId);
          if (index >= 0) drafts.splice(index, 1);
          return { ok: true as const };
        },
        delete: async (input: { draftId: string }) => {
          calls.push({ procedure: "routing.drafts.delete", input });
          const index = drafts.findIndex((draft) => draft.draftId === input.draftId);
          if (index >= 0) drafts.splice(index, 1);
          return { ok: true as const };
        },
        update: async (input: Record<string, unknown>) => { calls.push({ procedure: "routing.drafts.update", input }); return { ok: true as const }; },
      },
    },
  };
}

describe("RoutingRulesScreen", () => {
  test("renders routing rule table with requested columns", async () => {
    const caller = fakeCaller();
    const screen = new RoutingRulesScreen({ caller });

    await screen.load();
    const output = renderPlain((renderer) => screen.render(renderer));

    expect(output).toContain("Routing Rules");
    for (const column of ["Name", "Agent", "Scope", "Priority", "Source", "Enabled"]) {
      expect(output).toContain(column);
    }
    expect(output).toContain("Bug triage");
    expect(output).toContain("codex");
    expect(output).toContain("global");
    expect(output).toContain("manual");
    expect(output).toContain("yes");
  });

  test("creates, edits, toggles, deletes, and dry-runs selected routing rule through tRPC caller", async () => {
    const caller = fakeCaller();
    const screen = new RoutingRulesScreen({ caller });

    await screen.load();
    await screen.handleKey("n");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("New routing rule");
    await screen.submitRuleForm({
      name: "High priority",
      projectId: null,
      conditionsJson: { all: [{ fact: "task.priority", operator: "equal", value: "high" }] },
      actionAgent: "claude-code",
      actionSkillSet: ["review"],
      priority: 10,
      enabled: true,
    });

    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.create",
      input: {
        name: "High priority",
        projectId: null,
        conditionsJson: { all: [{ fact: "task.priority", operator: "equal", value: "high" }] },
        actionAgent: "claude-code",
        actionSkillSet: ["review"],
        priority: 10,
        enabled: true,
      },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("High priority");

    await screen.handleKey("e");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Edit routing rule");
    await screen.submitRuleForm({ id: "00000000-0000-4000-8000-000000000002", name: "High priority bugs", enabled: false });
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.update",
      input: { id: "00000000-0000-4000-8000-000000000002", name: "High priority bugs", enabled: false },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("no");

    await screen.handleKey("t");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Test routing rule");
    await screen.submitDryRun({
      title: "Fix auth",
      kind: "bug",
      priority: "high",
      tags: ["auth"],
    });
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.dryRun",
      input: { taskJson: { title: "Fix auth", kind: "bug", priority: "high", tags: ["auth"] } },
    });
    const dryRunOutput = renderPlain((renderer) => screen.render(renderer));
    expect(dryRunOutput).toContain("Decision: claude-code");
    expect(dryRunOutput).toContain("source: rule");

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Delete routing rule?");
    await screen.handleKey("y");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.delete",
      input: { id: "00000000-0000-4000-8000-000000000002" },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("High priority bugs");
  });

  test("loads drafts tab, approves and deletes drafts through the caller", async () => {
    const caller = fakeCaller([
      decision({ draftId: "draft-a", status: "recommended", confidence: 0.72, backend: "ollama" }),
      decision({ draftId: "draft-b", status: "conflict", confidence: 0.41, backend: "embedded" }),
    ]);
    const screen = new RoutingRulesScreen({ caller });

    await screen.load();
    await screen.handleKey("l");
    const draftsOutput = renderPlain((renderer) => screen.render(renderer));
    expect(draftsOutput).toContain("Draft ID");
    expect(draftsOutput).toContain("draft-a");
    expect(draftsOutput).toContain("review_needed");
    expect(draftsOutput).toContain("ollama");

    await screen.handleKey("a");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.drafts.approve",
      input: { draftId: "draft-a" },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("draft-a");

    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Delete routing rule? draft draft-b");
    await screen.handleKey("y");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.drafts.delete",
      input: { draftId: "draft-b" },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("No drafts");
  });

  test("raw JSON test flow validates invalid input and dry-runs normalized task facts", async () => {
    const caller = fakeCaller();
    const screen = new RoutingRulesScreen({ caller });

    await screen.load();
    await screen.handleKey("l");
    await screen.handleKey("l");
    await screen.handleKey("t");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Raw JSON Test Input");

    await screen.submitDryRun({ kind: "incident", priority: "high", tags: ["ops"] });
    const output = renderPlain((renderer) => screen.render(renderer));
    expect(output).toContain("Route Test");
    expect(output).toContain("Status: matched");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "routing.dryRun",
      input: { taskJson: { kind: "incident", priority: "high", tags: ["ops"] } },
    });
  });

  test("viewport scrolling keeps the cursor visible and project scoped rules render as project", async () => {
    const caller = fakeCaller();
    const screen = new RoutingRulesScreen({ caller, projectId: "project-1", viewportRows: 1 });

    await screen.load();
    await screen.submitRuleForm({
      name: "Ignored outside overlay",
      projectId: "project-1",
    });
    await screen.handleKey("n");
    await screen.submitRuleForm({
      name: "Project rule",
      projectId: "project-1",
      actionAgent: "claude-code",
      priority: 1,
    });
    await screen.handleKey("j");

    const output = renderPlain((renderer) => screen.render(renderer));
    expect(caller.calls[0]).toEqual({
      procedure: "routing.list",
      input: { projectId: "project-1" },
    });
    expect(output).toContain("project");
    expect(output).not.toContain("Bug triage");
  });

  test("backends tab reflects feature flags and input mode from the real environment", async () => {
    const previousFeatures = process.env.FULCRUM_FEATURES;
    const previousInputMode = process.env.FULCRUM_LLM_INPUT_MODE;
    process.env.FULCRUM_FEATURES = "router-llm,other";
    process.env.FULCRUM_LLM_INPUT_MODE = "facts_only";
    try {
      const screen = new RoutingRulesScreen({ caller: fakeCaller() });
      await screen.load();
      await screen.handleKey("l");
      await screen.handleKey("l");
      await screen.handleKey("l");

      const output = renderPlain((renderer) => screen.render(renderer));
      expect(output).toContain("Inference Backends");
      expect(output).toContain("LLM Routing");
      expect(output).toContain("enabled");
      expect(output).toContain("facts_only");
      expect(output).toContain("OpenAI-compatible");
    } finally {
      if (previousFeatures === undefined) delete process.env.FULCRUM_FEATURES;
      else process.env.FULCRUM_FEATURES = previousFeatures;
      if (previousInputMode === undefined) delete process.env.FULCRUM_LLM_INPUT_MODE;
      else process.env.FULCRUM_LLM_INPUT_MODE = previousInputMode;
    }
  });
});
