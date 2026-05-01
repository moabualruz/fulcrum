---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q32, Q35, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Schema migration 0010_artifacts: extend table, indexes, retention columns, projects amendment

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Schema changes section; issues lines 10-01)

## What to build
Write migration `0010_artifacts` that extends the existing `artifacts` stub table with all production columns (`mime`, `size_bytes`, `path`, `checksum_sha256`, `metadata_json`, `archived`, `retention_until`), adds all six composite indexes required by Q22 and Q35, and appends `artifact_retention_days integer NULL` to the `projects` table. Migration must be idempotent (`ADD COLUMN IF NOT EXISTS`) and run clean on both PGlite and PostgreSQL. No application logic — schema only.

## Acceptance criteria
- [ ] Schema migration: `0010_artifacts` applies clean twice (idempotent) on PGlite test DB; `artifacts` columns all present; `projects.artifact_retention_days` added.
- [ ] Indexes verified: `artifacts_org_project_date`, `artifacts_org_run`, `artifacts_org_task`, `artifacts_checksum`, `artifacts_retention` (partial WHERE NOT NULL), `artifacts_org_archived_date` all present via `pg_indexes` query.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate` bootstrap; no procedure needed for this slice.
- [ ] Web surface: N/A (schema-only slice).
- [ ] CLI command: `fulcrum doctor --json` reports schema version includes `0010_artifacts`; no crash.
- [ ] TUI screen: N/A.
- [ ] Tests: unit migration test asserts all columns + indexes present; integration test applies migration on fresh PGlite instance; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — `artifacts` stub table, `orgs`, `projects`, `events` DDL, graphile-worker bootstrap must exist.

## Notes / Tech-stack hints
- Use `ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS …` for idempotency per Q22.
- `retention_until` partial index: `WHERE retention_until IS NOT NULL` — pruner query benefit.
- `checksum_sha256` index non-unique by design (dedup detection only).
- PostgreSQL and PGlite both support generated columns in later versions; keep `tsvector` column for `search_documents`, not here.
- Failure gate: if PGlite WASM version doesn't support `bigint` columns, use `integer` with `size_bytes` capped at 2 GB and document the limit.
