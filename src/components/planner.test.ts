import { describe, expect, test } from "bun:test";
import { ALL_AGENT_IDS } from "../cli/mcp-registry.ts";
import { planComponentOperation } from "./planner.ts";

describe("component planner", () => {
  test("plans default profile install in catalog order", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "profile.default",
      agents: ["codex"],
    });
    expect(plan.profile).toBe("profile.default");
    expect(plan.actions.map((a) => a.componentId)).toEqual([
      "policy.tool-output",
      "rules.global",
      "package.caveman",
      "package.repomix",
      "skills.authored",
      "skills.upstream",
      "package.cloudflare",
      "package.superpowers",
      "mcp.deepwiki",
      "mcp.registry",
      "mcp.context7",
    ]);
    expect(plan.actions.every((a) => a.operation === "install")).toBe(true);
  });

  test("excludes profile members from generated actions", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "profile.default",
      agents: ["codex"],
      exclude: ["skills.upstream", "mcp.context7"],
    });

    expect(plan.actions.map((action) => action.componentId)).not.toContain("skills.upstream");
    expect(plan.actions.map((action) => action.componentId)).not.toContain("mcp.context7");
    expect(plan.actions.map((action) => action.componentId)).toContain("skills.authored");
  });

  test("limits agent-specific surfaces to requested agents", () => {
    const plan = planComponentOperation({
      operation: "enable",
      target: "hooks.format",
      agents: ["gemini"],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.agentId).toBe("gemini");
    expect(plan.actions[0]?.change).toBe("enable");
  });

  test("disable warns for surfaces without disabled state", () => {
    const plan = planComponentOperation({
      operation: "disable",
      target: "package.caveman",
      agents: ["codex"],
    });
    expect(plan.actions[0]?.change).toBe("noop");
    expect(plan.warnings.join("\n")).toContain("package.caveman does not support disable");
  });

  test("unknown component throws clear error", () => {
    expect(() =>
      planComponentOperation({
        operation: "install",
        target: "missing.component",
        agents: ["codex"],
      }),
    ).toThrow("unknown component: missing.component");
  });

  test("policy install produces one global action", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "policy.tool-output",
      agents: ["codex"],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.agentId).toBeUndefined();
  });

  test("vendor package install plans per requested agent with external-command risk", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "package.repomix",
      agents: ["codex", "gemini"],
    });
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions.map((a) => a.agentId)).toEqual(["codex", "gemini"]);
    expect(plan.actions.every((a) => a.risk === "external-command")).toBe(true);
  });

  test("unsupported disable with multiple agents produces one warning", () => {
    const plan = planComponentOperation({
      operation: "disable",
      target: "package.repomix",
      agents: ["codex", "gemini"],
    });
    expect(plan.actions).toHaveLength(2);
    expect(plan.warnings).toEqual(["package.repomix does not support disable"]);
  });

  test("defaults agents to all agent ids", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "hooks.format",
    });
    expect(plan.agents).toEqual([...ALL_AGENT_IDS]);
    expect(plan.actions.map((a) => a.agentId)).toEqual([...ALL_AGENT_IDS]);
  });

  test("empty agents defaults to all agent ids", () => {
    const plan = planComponentOperation({
      operation: "install",
      target: "hooks.format",
      agents: [],
    });
    expect(plan.agents).toEqual([...ALL_AGENT_IDS]);
    expect(plan.actions.map((a) => a.agentId)).toEqual([...ALL_AGENT_IDS]);
  });

  test("payload is preserved", () => {
    const hookPlan = planComponentOperation({
      operation: "install",
      target: "hooks.format",
      agents: ["codex"],
    });
    expect(hookPlan.actions[0]?.payload).toEqual({ recipe: "format" });

    const mcpPlan = planComponentOperation({
      operation: "install",
      target: "mcp.context7",
      agents: ["codex"],
    });
    expect(mcpPlan.actions[0]?.payload).toEqual({ name: "context7" });
  });
});
