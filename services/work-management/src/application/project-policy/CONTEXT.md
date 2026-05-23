# Project Policy

Sub-area that resolves how much authority an agent run has to execute tools and template effects, by reconciling trust modes from multiple policy sources into a single effective decision.

## Language

**TrustMode**:
The four-step authority ladder `manual | assisted | trusted | full-auto` used internally to rank how much an agent may do without human approval.
_Avoid_: Authority level, trust tier, autonomy mode.

**EffectiveAgentAuthority**:
The resolved decision combining agent profile, workflow default, project policy, and optional run override into one `trustMode` plus `permissionMode`.
_Avoid_: Effective policy, computed trust, merged authority.

**RunOverride**:
A per-run AuthorityPolicySource that can tighten authority but never loosen it without triggering `approvalRequired`.
_Avoid_: Run-level trust, session override, ad-hoc permission.

**TemplateEffect**:
A single side-effecting unit attached to a Template (`script | hook | command | doc | task | repo`) with optional `destructive` and `authorityEscalation` flags, evaluated against a TemplateEffectPolicy.
_Avoid_: Template action, template step, template hook.

**TemplateTrustDecision**:
The per-effect outcome (`canExecute`, `dryRun`, `approvalRequired`, `auditRequired`) produced by evaluating a TemplateEffectPolicy against a TemplateEffect.
_Avoid_: Effect verdict, execution gate, template policy result.

**ExecutableEffect**:
A TemplateEffect whose `kind` is `script | hook | command` or that carries a non-empty `command`; treated as high-risk regardless of `destructive`.
_Avoid_: Runnable step, shell effect, code effect.

## Relationships

- An **EffectiveAgentAuthority** is computed from up to four **AuthorityPolicySource** inputs (agent profile, workflow default, project policy, run override) by taking the most restrictive **TrustMode**.
- A **RunOverride** that proposes a looser **TrustMode** than the baseline is clamped to the baseline and forces `approvalRequired: true`.
- A **TrustMode** maps onto a Work Management **ToolPermissionMode** (`manual|assisted → review_each_tool`, `trusted → auto`, `full-auto → danger`).
- A **TemplateEffectPolicy** evaluated against a **TemplateEffect** produces exactly one **TemplateTrustDecision**.
- An **ExecutableEffect** requires `trustMode: full-auto` plus `allowExecutableEffects: true` to execute; a destructive effect additionally requires `allowDestructiveEffects: true`.

## Example dialogue

> **Dev:** "If the project policy says `auto` but the agent profile is `manual`, what does the run actually get?"
> **Domain expert:** "`manual` wins — the resolver always picks the most restrictive **TrustMode** across sources, so `permissionMode` collapses to `review_each_tool`. A **RunOverride** asking for `full-auto` doesn't change the answer; it just flips `approvalRequired` to true with reason `run-override-requested-looser-authority`."
> **Dev:** "And a Template with a `script` effect under `trusted`?"
> **Domain expert:** "Still blocked. **ExecutableEffect** needs `full-auto` *and* `allowExecutableEffects`. Anything less yields a dry-run **TemplateTrustDecision** with `approvalRequired: true`."

## Flagged ambiguities

- **TrustMode vs ToolPermissionMode** — resolved: **TrustMode** is the internal four-step ladder used by this sub-area; **ToolPermissionMode** is the three-value Project-facing setting defined in the parent Work Management context. They are bijectively mapped via `permissionModeFromTrustMode` / `trustModeFromToolPermissionMode`, never used as synonyms.
- **TemplateEffect destructive vs authorityEscalation** — resolved: both flags mark an effect as high-risk, but `destructive` additionally requires `allowDestructiveEffects` on the policy; `authorityEscalation` only forces the high-risk path without the second gate.
