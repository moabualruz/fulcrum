---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 01-sandcastle-dep-effect-singleton
---

# agent_runs schema migration — Sandcastle columns

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Add seven new properties to the `AgentRun` entity (`src/db/entities/sandbox/AgentRun.ts`) and generate a MikroORM v7 migration class via `mikro-orm migration:create`. Properties: `sandboxMode` (string, CHECK, default `'host'`), `iterationCount` (integer, default 0), `tokenUsed` (integer, nullable), `transcriptPath` (string, nullable), `workspaceDiffPath` (string, nullable), `agentName` (string, nullable), `agentVersion` (string, nullable). Add `searchDoc` ManyToOne FK to `SearchDocument` (nullable). Migration class lives at `src/db/migrations/Migration<timestamp>.ts`. Add composite index `(org_id, agent_name, status, created_at)`. `fulcrum db validate` must pass after migration.

## Acceptance criteria

- [ ] Adapter / profile: MikroORM migration class created; all seven properties present on `AgentRun` entity with correct types, NOT NULL constraints, and defaults.
- [ ] Lifecycle integration: `sandboxMode` has `CHECK (sandbox_mode IN ('host', 'docker', 'podman'))` constraint; default `'host'`.
- [ ] Lifecycle integration: composite index `agent_runs_agent_org ON agent_runs (org_id, agent_name, status, created_at)` present and verified via `EXPLAIN` in test.
- [ ] Surfaces parity: `searchDoc` ManyToOne FK to `SearchDocument` added (nullable).
- [ ] Tests: migration class applied in test DB (`mikro-orm migration:up`); `fulcrum db validate` exits 0; repository `.findOne()` round-trip asserts all seven properties accessible.

## Blocked by

01-sandcastle-dep-effect-singleton

## Notes

`token_used` is nullable (only written when `FULCRUM_FEATURES=token-tracking` flag is on). `iteration_count` defaults to `0`; incremented by the runner each loop turn. Per C2 (Q22): `(org_id, ...)` composite index is mandatory at creation time.
