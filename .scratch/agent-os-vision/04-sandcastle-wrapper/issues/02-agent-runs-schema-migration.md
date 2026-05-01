---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 01-sandcastle-dep-effect-singleton
---

# agent_runs schema migration — Sandcastle columns

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Write a Drizzle migration that adds the seven new columns to `agent_runs` required by the Sandcastle lifecycle: `sandbox_mode`, `iteration_count`, `token_used`, `transcript_path`, `workspace_diff_path`, `agent_name`, `agent_version`. Add the composite index `(org_id, agent_name, status, created_at)`. Include the `search_doc_id` FK column. Migration must be idempotent (`IF NOT EXISTS` / `IF NOT EXISTS` guards or Drizzle's push-safe pattern). `fulcrum db validate` must pass after migration.

## Acceptance criteria

- [ ] Adapter / profile: Drizzle migration file created; all seven columns present with correct types, NOT NULL constraints, and defaults matching PRD SQL.
- [ ] Lifecycle integration: `sandbox_mode` has `CHECK (sandbox_mode IN ('host', 'docker', 'podman'))` constraint; default `'host'`.
- [ ] Lifecycle integration: composite index `agent_runs_agent_org ON agent_runs (org_id, agent_name, status, created_at)` present and verified via `EXPLAIN` in test.
- [ ] Surfaces parity: `search_doc_id UUID REFERENCES search_documents(id)` column added (nullable).
- [ ] Tests: migration applied in a test DB; `fulcrum db validate` (or equivalent schema-check test) exits 0; `SELECT column_name FROM information_schema.columns WHERE table_name='agent_runs'` asserts all seven columns present.

## Blocked by

01-sandcastle-dep-effect-singleton

## Notes

`token_used` is nullable (only written when `FULCRUM_FEATURES=token-tracking` flag is on). `iteration_count` defaults to `0`; incremented by the runner each loop turn. Per C2 (Q22): `(org_id, ...)` composite index is mandatory at creation time.
