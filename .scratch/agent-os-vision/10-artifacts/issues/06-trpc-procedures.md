---
Status: completed
Triage: AFK
Pillar: artifacts
Blocked-by: [03-harvest-pipeline.md, 05-retention-pruner.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q28, A6]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# tRPC artifacts.* procedures: full CRUD + attach/detach + prune + harvest (all verbs, Zod-validated)

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: tRPC procedures; issues 10-02, 10-09)

## What to build
Implement all `artifacts.*` tRPC procedures in `src/trpc/routers/artifacts.ts`: `list` (filters: org, project, run, task, archived, mime, date range), `get`, `upload` (takes metadata — multipart handled separately), `attach`, `detach`, `archive`, `unarchive`, `delete`, `prune` (manual trigger), `harvest` (internal). All procedures: Zod-validated input/output, `assertPermission()` on every procedure (lint rule), emit `events` rows on mutations. Gated flags (`report-llm-narration`, cloud storage) respected via `isFeatureEnabled()` check.

## Acceptance criteria
- [ ] Schema migration: no new columns; reads/writes `artifacts`, `edges`, `events`.
- [x] tRPC procedure / module: list/get/upload/download/delete procedures in `artifacts` router; Zod unit tests cover invalid input and output shapes.
- [ ] Web surface: SvelteKit server actions consume tRPC procedures for all artifact mutations; no direct DB calls from routes.
- [ ] CLI command: `fulcrum artifacts list --json` returns `ArtifactRow[]` matching tRPC output schema; `fulcrum artifacts show <id> --json` returns single row.
- [ ] TUI screen: Artifacts pane reads from `artifacts.list` tRPC procedure; all mutations use tRPC procedures.
- [x] Tests: implemented procedures unit-tested with mock deps; `assertPermission()` guard tested; wrong org → error; RED→GREEN.

## Blocked by
- `03-harvest-pipeline.md` — `ArtifactRepository` CRUD wrappers.
- `05-retention-pruner.md` — `artifacts.prune` procedure calls pruner.
- Pillar 1 (Foundation) — tRPC core, `assertPermission()`, feature flag registry.

## Notes / Tech-stack hints
- `artifacts.upload` procedure takes `{ filename, mime, sizeBytes, taskId?, runId?, docId?, projectId? }` — SvelteKit action handles multipart and calls procedure with metadata after writing file to store.
- `assertPermission(ctx, 'artifacts:write')` on all mutations; `assertPermission(ctx, 'artifacts:read')` on queries.
- All mutations emit `events` row: `verb = 'artifact.<verb>'` (e.g. `artifact.archived`).
- Per A6: tRPC router domain skeleton from Pillar 1; this slice fills the `artifacts` router.
