import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import {
  AutomationRulesScreen,
  type AutomationRuleFormInput,
  type AutomationRulesScreenOptions,
  type TuiAutomationRule,
} from "./automation-rules.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 140, rows: 40 });
  render(new Renderer(tty));
  return tty.plainText();
}

function rule(overrides: Partial<TuiAutomationRule> = {}): TuiAutomationRule {
  return {
    id: "rule-auto-close",
    name: "auto-close stale done tasks",
    triggerType: "status_change",
    actionType: "archive_after_months",
    enabled: true,
    projectId: "project-auth",
    projectName: "Authentication rewrite",
    executionCount: 42,
    ...overrides,
  };
}

function fakeCaller(): AutomationRulesScreenOptions["caller"] & { calls: Array<{ procedure: string; input: unknown }> } {
  const calls: Array<{ procedure: string; input: unknown }> = [];
  const rows = [
    rule(),
    rule({
      id: "rule-review-owner",
      name: "assign review owner",
      triggerType: "label_added",
      actionType: "set_assignee",
      enabled: false,
      executionCount: 8,
    }),
  ];

  return {
    calls,
    automations: {
      list: async (input = {}) => {
        calls.push({ procedure: "automations.list", input });
        return rows;
      },
      create: async (input: AutomationRuleFormInput) => {
        calls.push({ procedure: "automations.create", input });
        const created = rule({
          id: `rule-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          name: input.name,
          triggerType: input.triggerType,
          actionType: input.actionType,
          projectId: input.projectId ?? "project-auth",
          executionCount: 0,
        });
        rows.push(created);
        return created;
      },
      update: async (input: { id: string; enabled?: boolean }) => {
        calls.push({ procedure: "automations.update", input });
        const index = rows.findIndex((row) => row.id === input.id);
        if (index === -1) throw new Error("missing rule");
        rows[index] = { ...rows[index]!, enabled: input.enabled ?? rows[index]!.enabled };
        return rows[index]!;
      },
      delete: async (input: { id: string }) => {
        calls.push({ procedure: "automations.delete", input });
        const index = rows.findIndex((row) => row.id === input.id);
        if (index >= 0) rows.splice(index, 1);
        return { ok: true as const };
      },
    },
  };
}

describe("AutomationRulesScreen", () => {
  test("renders project automation rules with name, project, trigger, action, status, and runs", async () => {
    const caller = fakeCaller();
    const screen = new AutomationRulesScreen({ caller, projectId: "project-auth" });

    await screen.load();
    const output = renderPlain((renderer) => screen.render(renderer));

    expect(caller.calls[0]).toEqual({ procedure: "automations.list", input: { projectId: "project-auth" } });
    for (const column of ["Rule", "Project", "Trigger", "Action", "Status", "Runs"]) {
      expect(output).toContain(column);
    }
    expect(output).toContain("auto-close stale done tasks");
    expect(output).toContain("Authentication re");
    expect(output).toContain("Status Change");
    expect(output).toContain("Archive After Mon");
    expect(output).toContain("enabled");
    expect(output).toContain("42");
  });

  test("searches, toggles, creates, and deletes automation rules through caller", async () => {
    const caller = fakeCaller();
    const screen = new AutomationRulesScreen({ caller, projectId: "project-auth" });

    await screen.load();
    screen.setSearch("review");
    const searched = renderPlain((renderer) => screen.render(renderer));
    expect(searched).toContain("assign review owner");
    expect(searched).not.toContain("auto-close stale done tasks");

    await screen.handleKey(" ");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "automations.update",
      input: { id: "rule-review-owner", enabled: true },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("enabled");

    await screen.handleKey("n");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("New automation rule");
    await screen.submitRuleForm({
      name: "review handoff reminder",
      triggerType: "task_created",
      actionType: "add_comment",
    });
    expect(caller.calls.at(-1)).toEqual({
      procedure: "automations.create",
      input: {
        name: "review handoff reminder",
        triggerType: "task_created",
        actionType: "add_comment",
        projectId: "project-auth",
      },
    });

    screen.setSearch("handoff");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("review handoff reminder");
    await screen.handleKey("d");
    expect(renderPlain((renderer) => screen.render(renderer))).toContain("Delete automation rule?");
    await screen.handleKey("y");
    expect(caller.calls.at(-1)).toEqual({
      procedure: "automations.delete",
      input: { id: "rule-review-handoff-reminder" },
    });
    expect(renderPlain((renderer) => screen.render(renderer))).not.toContain("review handoff reminder");
  });
});
