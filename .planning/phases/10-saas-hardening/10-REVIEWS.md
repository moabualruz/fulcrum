---
phase: 10
reviewers: [gemini, claude, opencode, lm_studio]
reviewed_at: 2026-05-06T06:37:12Z
plans_reviewed: [10-00-PLAN.md, 10-01-PLAN.md, 10-02-PLAN.md, 10-03-PLAN.md, 10-04-PLAN.md, 10-05-PLAN.md, 10-06-PLAN.md, 10-07-PLAN.md, 10-08-PLAN.md, 10-09-PLAN.md, 10-10-PLAN.md, 10-11-PLAN.md, 10-12-PLAN.md, 10-13-PLAN.md]
cycle: 1
---

# Cross-AI Plan Review — Phase 10

## Cycle 1 Summary

CYCLE_SUMMARY: current_high=7

## Current HIGH Concerns

- 10-11 is too large: it compresses CLOSURE-06..13 into one autonomous plan spanning docs, search, time tracking, dashboards, reports, multi-assignee, chart export, Goals/OKRs, task merge, and form templates.
- 10-12 is too large: it compresses external tracker dispatch, Slack/Discord/email, notification workflow designer, artifact attestations, repo cache, billing, quotas, OTel/SIEM, encryption verification, and CLI framework decisions into one autonomous plan.
- 10-09 writes UAT before later closure tables/features exist; final UAT evidence is split across 10-09 and 10-13.
- Production/SaaS operational hardening is incomplete: no deployment runbook, PGlite-to-PostgreSQL migration path, PostgreSQL backup/restore procedure, or cross-process instance test.
- PostgreSQL LISTEN/NOTIFY plan conflicts with transaction pooling unless the EventBus uses a dedicated long-lived `pg.Client` outside the MikroORM transaction pool.
- RLS/PGlite behavior is underspecified: local PGlite mode skips `SET LOCAL`, while RLS policies may depend on `current_setting('fulcrum.org_id')`.
- Closure migrations lack explicit ordering/naming/downgrade strategy across the large entity batch.

## Gemini Review

### Summary

Gemini found the SaaS hardening foundation credible, especially shared-schema PostgreSQL, transaction-local tenant identity, real PostgreSQL tests, and Huashu route gates. It raised three HIGH concerns: impossible plan size for 10-11/10-12, LISTEN/NOTIFY incompatibility with PgBouncer transaction pooling unless implemented with a dedicated session connection, and unclear PGlite/RLS behavior when local mode skips `SET LOCAL`.

### Strengths

- Defense in depth: `ctx.orgId` scoping plus RLS.
- `SET LOCAL fulcrum.org_id` correctly anticipates transaction pooling.
- RED PostgreSQL tests prevent false completion against PGlite.
- Huashu gate is testable without manual prototype work.

### Concerns

- HIGH: 10-11 and 10-12 are too large for autonomous execution and should be split into smaller domain plans.
- HIGH: `PostgresNotifyEventBus` must not rely on a pooled/transaction-pooling connection for `LISTEN`.
- HIGH: PGlite local behavior with RLS/current settings is underspecified.
- MEDIUM: graphile-worker schema initialization is missing.
- MEDIUM: 10-09 UAT happens before closure waves finish.

### Suggestions

- Split 10-11 into smaller product-feature plans and 10-12 into integration/enterprise plans.
- Require `PostgresNotifyEventBus` to use a standalone `pg.Client`.
- Explicitly document PGlite RLS bypass or local tenant-scope behavior.
- Add graphile-worker schema migration/init step.

### Risk Assessment

HIGH. SaaS foundation is sound, but overloaded closure plans and the LISTEN/pooling issue must be fixed before execution.

## Claude Review

### Summary

Claude assessed plans 10-00..10-09 as credible and well ordered, but judged plans 10-11..10-12 as a compressed product roadmap. It also raised migration sequencing, Testcontainers/Bun verification, existing org router handling, EventBus migration scope, and subjective Huashu scoring as risks.

### Strengths

- Strong TDD harness and wave ordering.
- Tenant isolation uses proper defense in depth.
- EventBus refactor and graphile-worker adapter preserve existing abstractions.
- Dedicated Web/CLI/TUI parity plans exist for SAS features.

### Concerns

- HIGH: 10-11 includes too many independent product features.
- HIGH: 10-12 includes too many integration and enterprise hardening features.
- HIGH: migration ordering for closure entities is missing.
- MEDIUM: Testcontainers+Bun compatibility is assumed before smoke verification.
- MEDIUM: `getEventBus()` compatibility shim lifetime and migration scope are undefined.
- MEDIUM: graphile-worker version is not named.
- MEDIUM: 10-02 should extend existing `orgs.ts`, not create it.
- MEDIUM: Huashu score is partly subjective unless backed by test gates and explicit reviewer evidence.

### Suggestions

- Split 10-11 into docs/search, task/time, and goals/reports/dashboard plans.
- Split 10-12 into connector/intake and enterprise hardening plans.
- Pin graphile-worker or add a pre-task that verifies and records the exact version.
- Add Bun+Testcontainers smoke verification.
- Explicitly list EventBus callers migrated to DI and remaining shim callers.

### Risk Assessment

MEDIUM-HIGH overall. SaaS core is low risk; closure batch is high risk due to excessive compression.

## OpenCode Review

### Summary

OpenCode agreed that waves 0-4 are solid and that the closure expansion is the main failure point. It emphasized Phase 5 precedent: 16 plans were needed for a smaller set of task-management requirements, so Phase 10 closure cannot credibly fit 18 closure items into four late plans. It also flagged UAT timing, missing deployment/operational plans, RED verification ambiguity, RLS transaction enforcement, auth-login underspecification, and missing invite parity.

### Strengths

- SAS core is well structured and TDD-first.
- Phase 10 does now include all closure items.
- Huashu gates are present as product-surface checks instead of marketing redesign.

### Concerns

- HIGH: 10-11 is 3-4 phases of product work in one plan.
- HIGH: 10-12 is similarly unexecutable due to many adapters and architectural decisions.
- HIGH: UAT is written before all implementation is complete and risks conflicts across waves.
- HIGH: SaaS operational/deployment plan is missing.
- MEDIUM: RED plan verification command conflicts with expected failing tests.
- MEDIUM: RLS requires explicit transaction boundaries; implicit MikroORM reads may bypass `SET LOCAL`.
- MEDIUM: CLI login closure can pass by returning unsupported error, leaving behavior effectively unresolved.
- MEDIUM: Huashu reference paths were not visible to OpenCode from repo-relative globbing.

### Suggestions

- Split 10-11 into at least three plans.
- Split 10-12 into at least three plans.
- Move all final UAT to a terminal verification plan.
- Add deployment/runbook/migration/backup/restore plan.
- Add cross-process tests for EventBus and worker coordination, not only two connections in one process.
- Fix RED verification wording in 10-00.

### Risk Assessment

HIGH. The plan is strong through 10-09 but will likely fail or produce shallow implementation for 10-11 and 10-12 unless split.

## LM Studio Review

### Summary

LM Studio considered the engineering methodology strong but the project-management strategy high risk. It highlighted scope explosion in 10-11/10-12, RLS exception debt, connector token/security lifecycle, and end-to-end async flow coverage.

### Strengths

- Strong tenant isolation pattern.
- RED testing discipline.
- Surface parity enforcement across Web/CLI/TUI.
- Real PostgreSQL tests for features PGlite cannot prove.

### Concerns

- HIGH: 10-11 and 10-12 create a feature-factory risk at the end of the milestone.
- MEDIUM: RLS exceptions need ongoing automated auditing, not only initial implementation.
- MEDIUM: external connectors need explicit token lifecycle and secret rotation verification.
- LOW: missing end-to-end async flow test from inbound webhook through EventBus/task persistence/TUI status.

### Suggestions

- Feature-flag closure items to protect core SaaS hardening.
- Add RLS migration linting to CI.
- Add signed webhook replay utility.
- Decouple product feature closure from integration/enterprise hardening.

### Risk Assessment

HIGH. Methodology is sound, but volume and coupling are too high for the current plan shape.

## Consensus Summary

### Agreed Strengths

- Plans 10-00..10-09 have a credible SaaS hardening foundation.
- Real PostgreSQL integration tests and tenant isolation matrix are necessary and well justified.
- Web/CLI/TUI/API parity is a strong requirement and should remain.
- Huashu as a focused design gate is appropriate for operational surfaces.

### Agreed Concerns

- Plans 10-11 and 10-12 must be split before execution.
- Final UAT must be moved to the end of the expanded closure phase.
- Migration ordering and downgrade strategy must be explicit for closure entities.
- EventBus and worker tests must prove process-level SaaS behavior, not only single-process connections.
- External connector security and local-first gating need sharper acceptance criteria.

### Divergent Views

- Gemini treated PGlite/RLS behavior as HIGH; other reviewers treated it as MEDIUM but agreed it needs explicit handling.
- Claude considered Testcontainers/Bun compatibility a MEDIUM risk; other reviewers did not emphasize it.
- OpenCode requested a separate deployment plan; others implied operational hardening but did not rank it as strongly.
