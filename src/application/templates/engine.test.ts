import { describe, expect, test } from "bun:test";

import { evaluateTemplateTrustPolicy } from "../project-policy/trust.ts";
import {
  AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
  loadTemplateSource,
  normalizeTemplate,
  previewTemplateEffects,
} from "./engine.ts";

describe("template engine", () => {
  test("normalizes built-in Agent OS Software Project template", async () => {
    const template = normalizeTemplate(await loadTemplateSource({
      kind: "built-in",
      id: AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID,
    }));

    expect(template.id).toBe(AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID);
    expect(template.modules).toContainEqual({ id: "repo", label: "Repo" });
    expect(template.modules).toContainEqual({ id: "workflow", label: "Workflow" });
    expect(template.workflow.id).toBe(AGENT_OS_SOFTWARE_PROJECT_TEMPLATE_ID);
  });

  test("keeps executable effects dry-run unless full-auto policy explicitly allows them", async () => {
    const template = normalizeTemplate({
      id: "exec-template",
      name: "Exec Template",
      modules: ["repo"],
      effects: [{ id: "hook-1", kind: "hook", command: "bun test", destructive: false }],
    });

    expect(previewTemplateEffects(template, { trustMode: "manual" })).toEqual([
      expect.objectContaining({ id: "hook-1", dryRun: true, approvalRequired: true }),
    ]);
    expect(evaluateTemplateTrustPolicy({ trustMode: "full-auto", allowExecutableEffects: true }, template.effects[0]!))
      .toMatchObject({ canExecute: true, auditRequired: true });
  });
});
