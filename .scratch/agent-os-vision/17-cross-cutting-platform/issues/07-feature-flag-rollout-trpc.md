---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md, 01-foundation-reset/issues/07-feature-flag-registry.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, Q-flag-granularity, B10, D5, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B10 feature-flag rollout)
Docs: https://kit.svelte.dev/docs
---

# Feature-flag rollout + cohorts + experiments — rollout.ts, experiment_assignment, flags.* tRPC, CLI + Web + TUI

## What to build

`src/features/rollout.ts`: `isEnabled(flagName, orgId, userId): boolean` evaluates: base `enabled` → cohort rules → rollout percentage. Rollout: deterministic `sha256(userId + flagName) % 100 < rollout_percent`. Cohort rules: `include_user_ids` takes priority over rollout %; `exclude_user_ids` always false; `org_plan` match; `created_after` date check. Assignment cached per-request (not per-process). `experiment_assignment` write: `sha256(userId + experimentId) % 100` → variant bucket; idempotent (UNIQUE constraint). `flags.*` tRPC: `list`, `get(name)`, `set(name, opts)` — validates `cohort_rules` JSON schema via Zod. `flags.experiments.*`: `list`, `assign(userId, experimentId)`. CLI: `fulcrum flags list/get/set [--rollout-percent] [--cohort-rules] [--json]`; `fulcrum flags experiments list`. Web: `/settings/feature-flags` (Pillar 16 issue 18). TUI: Settings → Feature Flags tab.

Cuts through: `flags.set('my-feature', {enabled:true, rollout_percent:50})` → `feature_flags` row → `rollout.isEnabled('my-feature', orgId, userId1)` → deterministic bool → cached per request.

## Acceptance criteria

- [ ] `rollout.isEnabled`: `enabled=false` → always false regardless of rollout %; `rollout_percent=0` → false; `rollout_percent=100` → true; `rollout_percent=50` → deterministic ~50% over 100 synthetic userIds (statistical assertion).
- [ ] Cohort `include_user_ids`: user in list → true regardless of rollout %; user not in list → evaluate rollout.
- [ ] Cohort `exclude_user_ids`: user in list → false always.
- [ ] `experiment_assignment`: same `(userId, experimentId)` always same variant (idempotent); 100 different userIds distributed per `rollout_percent`.
- [ ] `flags.set` validates `cohort_rules` Zod schema; invalid JSON → tRPC BAD_REQUEST.
- [ ] `flags.list --json` returns full `{name, enabled, rollout_percent, cohort_rules}` array.
- [ ] `isEnabled` cached per-request (not global mutable state); no cross-request bleed.
- [ ] Doctor: `platform.flags_registry` loads without error; `platform.experiment_table` exists.

## Blocked by

- Issue 01 (schema) — `feature_flags` addendum columns + `experiment_assignment` table.
- Pillar 1 issue 07 (feature flag registry) — base `feature_flags` table + `FULCRUM_FEATURES` env parser.
