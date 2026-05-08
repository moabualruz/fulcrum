export type TemplateTrustMode = "manual" | "assisted" | "trusted" | "full-auto";

export interface TemplateEffectPolicy {
  trustMode: TemplateTrustMode;
  allowExecutableEffects?: boolean;
  allowDestructiveEffects?: boolean;
}

export interface TemplateEffect {
  id: string;
  kind: "script" | "hook" | "command" | "doc" | "task" | "repo" | string;
  command?: string | null;
  destructive?: boolean;
  authorityEscalation?: boolean;
}

export interface TemplateTrustDecision {
  canExecute: boolean;
  dryRun: boolean;
  approvalRequired: boolean;
  auditRequired: boolean;
  reason: string;
}

export function evaluateTemplateTrustPolicy(
  policy: TemplateEffectPolicy,
  effect: TemplateEffect,
): TemplateTrustDecision {
  const executable = isExecutableEffect(effect);
  const highRisk = executable || effect.destructive === true || effect.authorityEscalation === true;
  const explicitExecution = policy.trustMode === "full-auto" && policy.allowExecutableEffects === true;
  const destructiveAllowed = effect.destructive !== true || policy.allowDestructiveEffects === true;
  const canExecute = highRisk ? explicitExecution && destructiveAllowed : policy.trustMode !== "manual";

  return {
    canExecute,
    dryRun: !canExecute,
    approvalRequired: highRisk && !canExecute,
    auditRequired: highRisk || canExecute,
    reason: canExecute ? "explicit-policy-allows-template-effect" : "template-effect-requires-approval",
  };
}

export function isExecutableEffect(effect: TemplateEffect): boolean {
  return effect.kind === "script" || effect.kind === "hook" || effect.kind === "command" || Boolean(effect.command);
}
