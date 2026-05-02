---
Status: integration-review
Owner: codex-orchestrator
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 02-agent-runs-schema-migration
---

# artifacts + edges tables migration

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Create two new MikroORM v7 entity classes — `Artifact` and `Edge` — and generate migration classes via `mikro-orm migration:create`. Entity files: `src/db/entities/sandbox/Artifact.ts`, `src/db/entities/sandbox/Edge.ts`. Both need `org` ManyToOne and composite `(org_id, …)` indexes per C2/Q22. `Edge` needs unique index on `(org_id, from_kind, from_id, to_kind, to_id, kind)`. `fulcrum db validate` must pass.

## Acceptance criteria

- [ ] Adapter / profile: `Artifact` entity has all properties from PRD: `id`, `org`, `run`, `task` (nullable), `filename`, `mime`, `sizeBytes`, `path`, `metadataJson`, `createdAt`; `run` ManyToOne FK to `AgentRun`; `task` nullable ManyToOne FK to `Task`.
- [ ] Adapter / profile: `Edge` entity has properties `id`, `org`, `fromKind`, `fromId`, `toKind`, `toId`, `kind`, `createdAt`.
- [ ] Lifecycle integration: indexes `artifacts_org_run (org_id, run_id)` and `artifacts_org_task (org_id, task_id)` present; `edges_from_to_kind` UNIQUE index and `edges_to_lookup (org_id, to_kind, to_id, kind)` index present.
- [ ] Surfaces parity: no new UI in this slice; entity + migration only.
- [ ] Tests: migration class applied in test DB; repository `.findOne()` round-trip asserts both entities + all four indexes exist.

## Blocked by

02-agent-runs-schema-migration

## Notes

`artifacts.metadata_json` is JSONB for arbitrary per-provider metadata (MIME sniffing, content hash, provider-assigned ID). `edges` is the general-purpose graph table used across Fulcrum (Q25); this slice only creates the table — other pillars will add their own edge types.
