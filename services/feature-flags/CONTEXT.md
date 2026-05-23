# Feature Flags

Feature flag ownership for Fulcrum: registered flag names, deterministic env parsing, cached DB-backed evaluation, rollout persistence, experiment state, and the HTTP/CLI/TUI/web-facing flag APIs.

## Language

**FeatureFlag**:
A named capability gate registered by Fulcrum and resolved from DB rows or `FULCRUM_FEATURES`.
_Avoid_: toggle, env knob, option

**FeatureFlagEvaluation**:
The computed result for a flag in a global, org, or user scope.
_Avoid_: permission result, setting value

**FeatureFlagRollout**:
A rollout percentage and cohort-rule policy attached to an org-scoped flag.
_Avoid_: experiment, AB bucket, tenant option

**ExperimentAssignment**:
A sticky subject-to-variant assignment used by experiment metrics.
_Avoid_: random pick, cohort guess

**FeatureFlagPublicApi**:
The Nest HTTP boundary for listing, evaluating, and mutating feature flags.
_Avoid_: platform-core flags route

## Relationships

- A **FeatureFlag** has zero-or-more scoped DB rows, with user scope winning over org scope and org scope winning over env defaults.
- A **FeatureFlagRollout** applies rollout percentage and cohort rules after a flag is registered.
- A **FeatureFlagEvaluation** is pure application behavior; persistence lives behind `FeatureFlagStore`.
- **FeatureFlagPublicApi** composes the feature-flags service into `apps/server` and is mirrored by CLI/TUI/web callers.

## Example dialogue

> **Dev:** "Should a settings page write a flag through platform-core?"
> **Domain expert:** "No. Call the feature-flags public API or service facade. Platform-core no longer owns flag registry or rollout behavior."

> **Dev:** "Is `public-api` an auth permission?"
> **Domain expert:** "No. It is a **FeatureFlag**. Auth still decides who may mutate it."

## Flagged ambiguities

- `FeatureFlag` still exists in identity-access as the auth-era TypeORM entity name. Resolution: feature-flags owns registry and evaluation behavior; identity-access entity provenance remains until a later persistence rename PRD.
- `FeatureFlagRollout` has older platform-core table/entity names. Resolution: feature-flags owns rollout semantics from this PRD onward; remaining storage names are migration debt unless touched by this slice.
