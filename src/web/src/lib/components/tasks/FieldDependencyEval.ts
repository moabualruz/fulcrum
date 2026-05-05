/**
 * FieldDependencyEval — Phase 05 Plan 12 (D-109, D-111 client-side).
 *
 * Pure, side-effect-free evaluator for field dependency rules.
 * Called reactively in the task form to show/hide/require fields instantly.
 *
 * Server-side validation is done separately in FieldDependencyService.ts
 * (D-111/HIGH-03) — client evaluation is UX-only and can be bypassed.
 */

export interface FieldDependencyRule {
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  /** "show" | "hide" | "require" */
  action: "show" | "hide" | "require";
}

export interface EvalResult {
  /** Fields that should be visible (explicit show or default). */
  visible: Set<string>;
  /** Fields that are explicitly hidden. */
  hidden: Set<string>;
  /** Fields that are required (also implied visible). */
  required: Set<string>;
}

/**
 * Evaluate all field dependency rules against the current field values.
 *
 * Default: all fields visible, none required, none hidden.
 * Rules that match override defaults.
 *
 * @param rules - Field dependency rules for the project.
 * @param fieldValues - Current values of all fields (fieldId → value).
 * @returns Sets of visible, hidden, and required field IDs.
 */
export function evaluateFieldDependencies(
  rules: FieldDependencyRule[],
  fieldValues: Record<string, unknown>,
): EvalResult {
  const visible = new Set<string>();
  const hidden = new Set<string>();
  const required = new Set<string>();

  for (const rule of rules) {
    const actual = String(fieldValues[rule.sourceFieldId] ?? "");
    if (actual !== rule.sourceValue) continue; // rule not triggered

    const target = rule.targetFieldId;

    switch (rule.action) {
      case "show":
        visible.add(target);
        hidden.delete(target);
        break;

      case "hide":
        hidden.add(target);
        visible.delete(target);
        required.delete(target); // hidden fields can't be required
        break;

      case "require":
        required.add(target);
        visible.add(target); // required implies visible
        hidden.delete(target);
        break;
    }
  }

  return { visible, hidden, required };
}
