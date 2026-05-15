import { describe, expect, test } from "bun:test";

import {
  applyWorkflowConfig,
  normalizeWorkflowOptions,
  shouldApplyToolDefinitionRewrites,
  shouldInjectFullPlanningPrompt,
  shouldInjectGenericPlanReminder,
  shouldModifyPrompts,
  shouldRegisterSubmitPlan,
  shouldRejectSubmitPlanForAgent,
} from "@planning-review/application/planning-workflow.ts";

describe("review planning behavior behavior", () => {
  test("defaults omitted options to plan-agent with built-in plan agent", () => {
    const options = normalizeWorkflowOptions(undefined);
    expect(options.workflow).toBe("plan-agent");
    expect(options.planningAgents).toEqual(["plan"]);
    expect(options.planningAgentSet.has("plan")).toBe(true);
  });

  test("falls back to plan-agent for unknown workflows and normalizes planning agents", () => {
    const options = normalizeWorkflowOptions({
      workflow: "auto-everywhere",
      planningAgents: [" planner ", "", "planner", 123],
    });
    expect(options.workflow).toBe("plan-agent");
    expect(options.planningAgents).toEqual(["plan", "planner"]);
  });

  test("manual and user-managed modes gate prompts and tools differently", () => {
    const manual = normalizeWorkflowOptions({ workflow: "manual" });
    expect(shouldRegisterSubmitPlan(manual)).toBe(false);
    expect(shouldApplyToolDefinitionRewrites(manual)).toBe(false);
    expect(shouldInjectFullPlanningPrompt("plan", manual)).toBe(false);
    expect(shouldRejectSubmitPlanForAgent("build", manual)).toBe(false);

    const userManaged = normalizeWorkflowOptions({ workflow: "user-managed" });
    expect(shouldRegisterSubmitPlan(userManaged)).toBe(true);
    expect(shouldModifyPrompts(userManaged)).toBe(false);
    expect(shouldApplyToolDefinitionRewrites(userManaged)).toBe(false);
    expect(shouldInjectFullPlanningPrompt("plan", userManaged)).toBe(false);
    expect(shouldRejectSubmitPlanForAgent("build", userManaged)).toBe(false);
  });

  test("plan-agent mode injects only configured planning agents and rejects other submitters", () => {
    const options = normalizeWorkflowOptions({
      workflow: "plan-agent",
      planningAgents: ["plan", "planner"],
    });

    expect(shouldRegisterSubmitPlan(options)).toBe(true);
    expect(shouldApplyToolDefinitionRewrites(options)).toBe(true);
    expect(shouldInjectFullPlanningPrompt("plan", options)).toBe(true);
    expect(shouldInjectFullPlanningPrompt("planner", options)).toBe(true);
    expect(shouldInjectFullPlanningPrompt("build", options)).toBe(false);
    expect(shouldRejectSubmitPlanForAgent("plan", options)).toBe(false);
    expect(shouldRejectSubmitPlanForAgent("build", options)).toBe(true);
    expect(shouldRejectSubmitPlanForAgent(undefined, options)).toBe(true);
  });

  test("all-agents mode keeps generic primary-agent reminder for non-planning agents", () => {
    const options = normalizeWorkflowOptions({ workflow: "all-agents" });
    expect(shouldInjectGenericPlanReminder("reviewer", false, options)).toBe(true);
    expect(shouldInjectGenericPlanReminder("build", false, options)).toBe(false);
    expect(shouldInjectGenericPlanReminder("reviewer", true, options)).toBe(false);
    expect(shouldInjectGenericPlanReminder("plan", false, options)).toBe(false);
  });

  test("plan-agent mode exposes submit_plan to plan and denies build", () => {
    const config: Record<string, any> = {
      experimental: {
        primary_tools: ["bash"],
        other: true,
      },
    };

    applyWorkflowConfig(config, normalizeWorkflowOptions(undefined), false);

    expect(config.experimental).toEqual({
      primary_tools: ["bash", "submit_plan"],
      other: true,
    });
    expect(config.agent.plan.permission.submit_plan).toBe("allow");
    expect(config.agent.plan.permission.edit).toEqual({ "*.md": "allow" });
    expect(config.agent.build.permission.submit_plan).toBe("deny");
  });

  test("plan-agent mode preserves user agent fields and resolves display-named agents", () => {
    const prometheusKey = "\u200B\u200B\u200BPrometheus - Plan Builder";
    const config: Record<string, any> = {
      agent: {
        planner: {
          mode: "primary",
          model: "test-model",
          prompt: "custom prompt",
          permission: {
            bash: "deny",
            edit: "deny",
          },
        },
        [prometheusKey]: {
          mode: "primary",
          permission: {},
        },
      },
    };

    applyWorkflowConfig(
      config,
      normalizeWorkflowOptions({
        workflow: "plan-agent",
        planningAgents: ["planner", "prometheus"],
      }),
      false,
    );

    expect(config.agent.planner.model).toBe("test-model");
    expect(config.agent.planner.prompt).toBe("custom prompt");
    expect(config.agent.planner.permission.bash).toBe("deny");
    expect(config.agent.planner.permission.submit_plan).toBe("allow");
    expect(config.agent.planner.permission.edit).toEqual({ "*": "deny", "*.md": "allow" });
    expect(config.agent[prometheusKey].permission.submit_plan).toBe("allow");
    expect(config.agent.prometheus).toBeUndefined();
    expect(config.agent.build.permission.submit_plan).toBe("deny");
  });

  test("all-agents mode preserves broad access while allowing planning agents", () => {
    const config: Record<string, any> = {
      agent: {
        build: {
          permission: {
            bash: "ask",
          },
        },
      },
    };

    applyWorkflowConfig(config, normalizeWorkflowOptions({ workflow: "all-agents" }), false);

    expect(config.agent.plan.permission.submit_plan).toBe("allow");
    expect(config.agent.build.permission.submit_plan).toBeUndefined();
    expect(config.agent.build.permission.bash).toBe("ask");
    expect(config.experimental.primary_tools).toEqual(["submit_plan"]);
  });
});
