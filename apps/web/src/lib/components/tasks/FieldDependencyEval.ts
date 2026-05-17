export interface FieldDependencyRule {
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  action: "show" | "hide" | "require";
}

export interface EvalResult {
  visible: Set<string>;
  hidden: Set<string>;
  required: Set<string>;
}

export function evaluateFieldDependencies(
  rules: FieldDependencyRule[],
  fieldValues: Record<string, unknown>,
): EvalResult {
  const visible = new Set<string>();
  const hidden = new Set<string>();
  const required = new Set<string>();

  for (const rule of rules) {
    const actual = String(fieldValues[rule.sourceFieldId] ?? "");
    if (actual !== rule.sourceValue) continue;

    const target = rule.targetFieldId;

    switch (rule.action) {
      case "show":
        visible.add(target);
        hidden.delete(target);
        break;

      case "hide":
        hidden.add(target);
        visible.delete(target);
        required.delete(target);
        break;

      case "require":
        required.add(target);
        visible.add(target);
        hidden.delete(target);
        break;
    }
  }

  return { visible, hidden, required };
}
