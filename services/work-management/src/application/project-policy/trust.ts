export type TemplateTrustMode = "manual" | "assisted" | "trusted" | "full-auto";
const TRUST_ORDER: Record<TemplateTrustMode, number> = {
  manual: 0,
  assisted: 1,
  trusted: 2,
  "full-auto": 3,
};

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

export interface AuthorityPolicySource {
  trustMode?: TemplateTrustMode | null;
}

export interface EffectiveAgentAuthorityInput {
  agentProfile?: AuthorityPolicySource | null;
  workflowDefault?: AuthorityPolicySource | null;
  projectPolicy?: AuthorityPolicySource | null;
  runOverride?: AuthorityPolicySource | null;
}

export interface EffectiveAgentAuthority {
  trustMode: TemplateTrustMode;
  approvalRequired: boolean;
  reason: "most-restrictive-policy" | "run-override-requested-looser-authority";
  sources: {
    agentProfile: TemplateTrustMode;
    workflowDefault: TemplateTrustMode;
    projectPolicy: TemplateTrustMode;
    runOverride: TemplateTrustMode | null;
  };
}

export function resolveEffectiveAgentAuthority(input: EffectiveAgentAuthorityInput): EffectiveAgentAuthority {
  const sources = {
    agentProfile: input.agentProfile?.trustMode ?? "assisted",
    workflowDefault: input.workflowDefault?.trustMode ?? "assisted",
    projectPolicy: input.projectPolicy?.trustMode ?? "assisted",
    runOverride: input.runOverride?.trustMode ?? null,
  } satisfies EffectiveAgentAuthority["sources"];
  const baseline = mostRestrictive([
    sources.agentProfile,
    sources.workflowDefault,
    sources.projectPolicy,
  ]);
  const requested = sources.runOverride;
  const overrideLoosens = requested !== null && TRUST_ORDER[requested] > TRUST_ORDER[baseline];
  return {
    trustMode: requested === null ? baseline : mostRestrictive([baseline, requested]),
    approvalRequired: baseline === "manual" || overrideLoosens,
    reason: overrideLoosens ? "run-override-requested-looser-authority" : "most-restrictive-policy",
    sources,
  };
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

function mostRestrictive(modes: TemplateTrustMode[]): TemplateTrustMode {
  return modes.reduce((current, mode) => TRUST_ORDER[mode] < TRUST_ORDER[current] ? mode : current, "full-auto");
}
