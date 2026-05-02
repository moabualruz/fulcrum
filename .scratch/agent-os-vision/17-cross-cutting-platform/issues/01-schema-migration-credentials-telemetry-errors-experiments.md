---
Status: completed
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [01-foundation-reset/issues/01-schema-auth-migration.md]
Owner: codex-orchestrator
ClaimedAt: 2026-05-02T01:12:17Z
ReviewVerdict: SPEC PASS / QUALITY APPROVED — re-review 2026-05-02 after e1dfca7 fixed rollout CHECK + text drift
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, Q22, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B7, B8, B9, B10)
Docs: https://pglite.dev/docs
---

# Migration class — Credential, TelemetryEvent, ErrorLog, ExperimentAssignment, FeatureFlagRollout

## What to build

Write and apply migration class `Migration<timestamp>` for the five entity additions owned by Pillar 17. (1) `Credential` with UNIQUE `(org_id, user_id, name)`, composite indexes `(org_id, user_id, last_used_at DESC)` and `(org_id, archived)`. (2) `TelemetryEvent` with indexes `(org_id, occurred_at DESC)` and `(org_id, user_id, kind)`. (3) `ErrorLog` with index `(org_id, occurred_at DESC)`. (4) `ExperimentAssignment` with UNIQUE `(org_id, user_id, experiment_id)` and index `(org_id, experiment_id)`. (5) `FeatureFlagRollout` with UNIQUE `(org_id, flag_id)`, `rolloutPercent`, `cohortRules`, `updatedBy`, `updatedAt`. All entities: `org_id NOT NULL` + FK cascade + composite indexes mandatory per Q22.

Cuts through: entity decorators → MikroORM migration class → metadata-shape unit test → idempotent re-run.

## Acceptance criteria

- [x] All 5 entity mappings created with correct properties, types, required flags, FK targets, UNIQUE constraints, enum/range validators, composite indexes.
- [x] `FeatureFlagRollout` links to Pillar 1 `FeatureFlag` and keeps rollout/cohort data outside the base flag entity.
- [x] Migration idempotent: running twice → no error, no duplicate entities/indexes.
- [x] Runs clean on PGlite WASM in-process AND standard Postgres (pg driver).
- [x] Unit test: `tests/db/migrations/Migration<timestamp>.test.ts` — asserts every entity/property/index via MikroORM metadata + repository smoke checks; RED → GREEN.
- [x] `org_id` NOT NULL on every entity; FK to `Org` with cascade verified.

## Blocked by

- Pillar 1 issue 01 (auth entities migration) — `Org`, `User`, `FeatureFlag`, and `TenantSetting` entities must exist for FKs.
