export type TemplateTrustMode = "manual" | "assisted" | "trusted" | "full-auto";
export type ToolPermissionMode = "review_each_tool" | "auto" | "danger";

const TRUST_ORDER: Record<TemplateTrustMode, number> = {
  manual: 0,
  assisted: 1,
  trusted: 2,
  "full-auto": 3,
};

const TOOL_PERMISSION_TO_TRUST_MODE: Record<ToolPermissionMode, TemplateTrustMode> = {
  review_each_tool: "manual",
  auto: "trusted",
  danger: "full-auto",
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
  permissionMode: ToolPermissionMode;
  approvalRequired: boolean;
  reason: "most-restrictive-policy" | "run-override-requested-looser-authority";
  sources: {
    agentProfile: TemplateTrustMode;
    workflowDefault: TemplateTrustMode;
    projectPolicy: TemplateTrustMode;
    runOverride: TemplateTrustMode | null;
  };
}

export interface ToolAuthorityDecision {
  permissionMode: ToolPermissionMode;
  allowed: boolean;
  approvalRequired: boolean;
  auditRequired: boolean;
  reason:
    | "review-each-tool-requires-approval"
    | "auto-allows-safe-tool"
    | "auto-requires-approval-for-risky-tool"
    | "danger-mode-allows-operator-owned-tool";
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
    permissionMode: permissionModeFromTrustMode(requested === null ? baseline : mostRestrictive([baseline, requested])),
    approvalRequired: baseline === "manual" || overrideLoosens,
    reason: overrideLoosens ? "run-override-requested-looser-authority" : "most-restrictive-policy",
    sources,
  };
}

export function normalizeToolPermissionMode(value: unknown): ToolPermissionMode {
  if (value === "review_each_tool" || value === "auto" || value === "danger") return value;
  if (value === "manual" || value === "assisted") return "review_each_tool";
  if (value === "trusted") return "auto";
  if (value === "full-auto") return "danger";
  return "review_each_tool";
}

export function trustModeFromToolPermissionMode(mode: ToolPermissionMode): TemplateTrustMode {
  return TOOL_PERMISSION_TO_TRUST_MODE[mode];
}

export function permissionModeFromTrustMode(mode: TemplateTrustMode): ToolPermissionMode {
  if (mode === "full-auto") return "danger";
  if (mode === "trusted") return "auto";
  return "review_each_tool";
}

export function projectPolicySourceFromModulePolicy(
  policy: Record<string, unknown> | null | undefined,
): AuthorityPolicySource {
  const permissionMode = normalizeToolPermissionMode(policy?.["toolPermissionMode"] ?? policy?.["trustMode"]);
  return { trustMode: trustModeFromToolPermissionMode(permissionMode) };
}

export function evaluateToolAuthority(input: {
  permissionMode: ToolPermissionMode;
  safe: boolean;
  destructive?: boolean;
  authorityEscalation?: boolean;
}): ToolAuthorityDecision {
  const risky = input.destructive === true || input.authorityEscalation === true || !input.safe;
  if (input.permissionMode === "review_each_tool") {
    return {
      permissionMode: input.permissionMode,
      allowed: false,
      approvalRequired: true,
      auditRequired: true,
      reason: "review-each-tool-requires-approval",
    };
  }
  if (input.permissionMode === "auto") {
    return {
      permissionMode: input.permissionMode,
      allowed: !risky,
      approvalRequired: risky,
      auditRequired: true,
      reason: risky ? "auto-requires-approval-for-risky-tool" : "auto-allows-safe-tool",
    };
  }
  return {
    permissionMode: input.permissionMode,
    allowed: true,
    approvalRequired: false,
    auditRequired: true,
    reason: "danger-mode-allows-operator-owned-tool",
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
