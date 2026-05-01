---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 02-agent-runs-schema-migration
---

# artifacts + edges tables migration

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Write Drizzle migrations for two new tables: `artifacts` (stores harvested files from agent runs) and `edges` (stores typed relationships between entities, e.g. `artifact → generated_by → agent_run`). Both tables need `org_id` composite indexes per C2/Q22. The `edges` table needs a unique index on `(org_id, from_kind, from_id, to_kind, to_id, kind)` to prevent duplicate relationship rows. `fulcrum db validate` must pass.

## Acceptance criteria

- [ ] Adapter / profile: `artifacts` table created with all columns from PRD schema: `id`, `org_id`, `run_id`, `task_id`, `filename`, `mime`, `size_bytes`, `path`, `metadata_json`, `created_at`; `run_id` FK to `agent_runs(id)`; `task_id` nullable FK to `tasks(id)`.
- [ ] Adapter / profile: `edges` table created with `id`, `org_id`, `from_kind`, `from_id`, `to_kind`, `to_id`, `kind`, `created_at`.
- [ ] Lifecycle integration: indexes `artifacts_org_run (org_id, run_id)` and `artifacts_org_task (org_id, task_id)` present; `edges_from_to_kind` UNIQUE index and `edges_to_lookup (org_id, to_kind, to_id, kind)` index present.
- [ ] Surfaces parity: no new UI in this slice; schema only.
- [ ] Tests: migration applied in test DB; schema-check test asserts both tables and all four indexes exist; insert + query round-trip test for both tables.

## Blocked by

02-agent-runs-schema-migration

## Notes

`artifacts.metadata_json` is JSONB for arbitrary per-provider metadata (MIME sniffing, content hash, provider-assigned ID). `edges` is the general-purpose graph table used across Fulcrum (Q25); this slice only creates the table — other pillars will add their own edge types.
