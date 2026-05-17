---
Status: completed
Triage: AFK
Pillar: artifacts
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q32, Q35, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Artifact entity migration class: indexes, retention properties, projects amendment

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Schema changes section; issues lines 10-01)

## What to build
Write `Artifact` and `ArtifactLifecycle` MikroORM v7 entity classes plus generated migration class `Migration<timestamp>` covering all production properties (`mime`, `sizeBytes`, `path`, `checksumSha256`, `metadataJson`, `archived`, `retentionUntil`), all six decorator indexes required by Q22 and Q35, and the `Project.artifactRetentionDays` property amendment. Migration class must be idempotent and run clean on both PGlite and PostgreSQL. No application logic — entity/migration only.

## Acceptance criteria
- [ ] Schema migration: `Migration<timestamp>` applies clean twice (idempotent) on PGlite test DB; `Artifact` properties all present; `Project.artifactRetentionDays` added.
- [ ] Indexes verified: `artifacts_org_project_date`, `artifacts_org_run`, `artifacts_org_task`, `artifacts_checksum`, `artifacts_retention`, `artifacts_org_archived_date` all present in MikroORM metadata.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate` bootstrap; no procedure needed for this slice.
- [ ] Web surface: N/A (schema-only slice).
- [ ] CLI command: `fulcrum doctor --json` reports migration class `Migration<timestamp>` covering artifacts has applied; no crash.
- [ ] TUI screen: N/A.
- [ ] Tests: fixture-backed entity metadata test asserts all columns + indexes present; DB-backed integration test applies migration on fresh PGlite instance; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — base `Artifact`, `Org`, `Project`, and `Event` entities plus graphile-worker bootstrap must exist.

## Notes / Tech-stack hints
- Use MikroORM entity diff generation for idempotency per Q22.
- `retentionUntil` index supports the pruner repository lookup.
- `checksum_sha256` index non-unique by design (dedup detection only).
- PostgreSQL and PGlite support this property set; full-text search fields stay in Pillar 11 entities, not here.
- Failure gate: if PGlite WASM version doesn't support `bigint` columns, use `integer` with `size_bytes` capped at 2 GB and document the limit.
