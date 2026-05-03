---
Status: implemented
Triage: AFK
Pillar: artifacts
Blocked-by: [01-schema-migration.md, 02-storage-backend.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q32, Q35]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Harvest pipeline: SHA-256, MIME sniff, store copy, DB row, edges rows, search_documents upsert

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Harvest pipeline; issues 10-04)

## What to build
Implement `harvestArtifacts(runId, extractedDir)` in `src/artifacts/harvest.ts`. End-to-end vertical slice: reads handoff directory from Sandcastle `copyFileOut()`, computes SHA-256 via `node:crypto`, sniffs MIME via `mime-types`, resolves `retentionUntil` through `ProjectRepository`, copies file to `LocalFsBackend`, calls `ArtifactRepository.create(...)`, calls `EdgeRepository.createMany(...)` for `artifact→generated_by→agent_run` + `agent_run→produced→artifact` per Q32 hybrid edge registry, calls `SearchDocumentRepository.upsertArtifactPreview(...)` (title=filename, body=first 2000 chars for text MIME), and calls `EventRepository.recordArtifactHarvested(...)`. Returns `{ artifacts: Artifact[] }`.

## Acceptance criteria
- [ ] Schema migration: reads `Artifact` entity properties from migration class `Migration<timestamp>`; writes through artifact, edge, and search repositories.
- [ ] tRPC procedure / module: `src/artifacts/harvest.ts` exports `harvestArtifacts()`; `ArtifactRepository` CRUD wrappers emit events on every mutation.
- [ ] Web surface: `/runs/<id>/artifacts` route shows harvested artifacts after run completes.
- [ ] CLI command: `fulcrum artifacts list --run-id <id> --json` returns harvested artifacts with correct SHA + MIME.
- [ ] TUI screen: Artifacts pane lists harvested artifacts with MIME badge after run.
- [ ] Tests: fixture with 3 mixed files (PNG, .ts, .bin) → 3 artifact rows + correct SHAs + correct MIMEs + files on disk + 6 edges rows + 3 `search_documents` rows (text artifacts have non-empty body); `ENOSPC` → no DB row written; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — DB columns.
- `02-storage-backend.md` — `LocalFsBackend` for file copy.
- Pillar 4 (Sandcastle) — handoff path contract; can mock for unit tests.
- Pillar 11 (Search) — `SearchDocument` entity + repository must exist; Pillar 11 owns FTS, this slice only writes through the repository.

## Notes / Tech-stack hints
- `mime-types` v3 (MIT) primary; add `file-type` v19 (MIT) as secondary magic-byte sniff for binary formats where extension is missing.
- `node:crypto` `createHash('sha256')` streaming — do not buffer large files.
- `edges` kind values: `'generated_by'` and `'produced'` — registered in Pillar 1 edge-kind registry per Q32.
- `SearchDocumentRepository.upsertArtifactPreview(...)` owns idempotent re-harvest behavior.
- Dedup check: if same `(run_id, filename, checksum_sha256)` already exists, skip copy and reuse existing row.
- Failure gate: MIME misidentify → `file-type` secondary sniff; disk full → clean partial file, emit `artifact.harvest.failed`, no DB row.
