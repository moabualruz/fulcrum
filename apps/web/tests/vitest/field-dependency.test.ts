import { describe, it, expect } from "vitest";
import { evaluateFieldDependencies, type FieldDependencyRule } from "../../src/lib/components/tasks/FieldDependencyEval.js";

describe("field dependency evaluator", () => {
  it("empty rules returns empty sets", () => {
    const result = evaluateFieldDependencies([], { status: "open" });
    expect(result.visible.size).toBe(0);
    expect(result.hidden.size).toBe(0);
    expect(result.required.size).toBe(0);
  });

  it("show action makes target visible", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "show" },
    ];
    const result = evaluateFieldDependencies(rules, { type: "bug" });
    expect(result.visible.has("severity")).toBe(true);
    expect(result.hidden.has("severity")).toBe(false);
  });

  it("hide action hides target and removes from required", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "require" },
      { sourceFieldId: "priority", sourceValue: "low", targetFieldId: "severity", action: "hide" },
    ];
    const result = evaluateFieldDependencies(rules, { type: "bug", priority: "low" });
    expect(result.hidden.has("severity")).toBe(true);
    expect(result.required.has("severity")).toBe(false);
    expect(result.visible.has("severity")).toBe(false);
  });

  it("require action implies visible", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "status", sourceValue: "in_progress", targetFieldId: "assignee", action: "require" },
    ];
    const result = evaluateFieldDependencies(rules, { status: "in_progress" });
    expect(result.required.has("assignee")).toBe(true);
    expect(result.visible.has("assignee")).toBe(true);
  });

  it("rule not triggered when source value does not match", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "show" },
    ];
    const result = evaluateFieldDependencies(rules, { type: "feature" });
    expect(result.visible.has("severity")).toBe(false);
  });

  it("missing field value treated as empty string", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "type", sourceValue: "", targetFieldId: "notes", action: "show" },
    ];
    const result = evaluateFieldDependencies(rules, {});
    expect(result.visible.has("notes")).toBe(true);
  });

  it("conflicting show then hide — last rule wins", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "a", sourceValue: "1", targetFieldId: "x", action: "show" },
      { sourceFieldId: "b", sourceValue: "2", targetFieldId: "x", action: "hide" },
    ];
    const result = evaluateFieldDependencies(rules, { a: "1", b: "2" });
    expect(result.hidden.has("x")).toBe(true);
    expect(result.visible.has("x")).toBe(false);
  });

  it("multiple independent rules evaluate correctly", () => {
    const rules: FieldDependencyRule[] = [
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "require" },
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "steps_to_repro", action: "show" },
      { sourceFieldId: "type", sourceValue: "bug", targetFieldId: "feature_spec", action: "hide" },
    ];
    const result = evaluateFieldDependencies(rules, { type: "bug" });
    expect(result.required.has("severity")).toBe(true);
    expect(result.visible.has("steps_to_repro")).toBe(true);
    expect(result.hidden.has("feature_spec")).toBe(true);
  });
});
