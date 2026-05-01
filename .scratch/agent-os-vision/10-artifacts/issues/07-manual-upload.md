---
Status: ready-for-agent
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q32, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Manual upload: SvelteKit multipart action + edges attached_to + Web drag-drop widget + CLI upload + TUI hotkey

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Manual upload + preview + CRUD; issues 10-07, 10-13)

## What to build
End-to-end manual upload slice cutting all three surfaces. SvelteKit form action at `+server.ts` handles multipart POST: streams file to `LocalFsBackend`, calls `artifacts.upload` tRPC procedure with metadata, writes `edges` row `(artifact→attached_to→task|doc|run)`. Web: drag-drop widget component (`src/lib/components/ArtifactUpload.svelte`) embedded in task/run/doc detail pages with progress bar and file-type badge. CLI: `fulcrum artifacts upload <file> [--task-id|--run-id|--doc-id] [--project-id]` via tRPC codegen. TUI: `u` hotkey opens file-path input prompt → uploads via tRPC in-process.

## Acceptance criteria
- [ ] Schema migration: `edges` row with `kind='attached_to'` written on upload; readable via `edges` query.
- [ ] tRPC procedure / module: `artifacts.upload` called with full metadata; artifact row and edges row present in DB.
- [ ] Web surface: drag-drop widget on task detail page uploads file; progress shows bytes written; artifact appears in task's artifact list without page reload; Playwright test: drop file → artifact visible.
- [ ] CLI command: `fulcrum artifacts upload ./foo.txt --task-id <id> --json` → returns `ArtifactRow`; `fulcrum artifacts list --task-id <id> --json` includes the artifact.
- [ ] TUI screen: `u` key opens prompt; path entered; file uploaded; attachment badge appears in Artifacts pane for that task.
- [ ] Tests: multipart upload integration test (mock stream); `attached_to` edge row verified; `list --task-id` returns artifact on all surfaces; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — `artifacts.upload` tRPC procedure.
- `02-storage-backend.md` — `LocalFsBackend.put`.
- Pillar 1 (Foundation) — `edges` table DDL + edge-kind registry.

## Notes / Tech-stack hints
- `FULCRUM_ARTIFACT_MAX_SIZE_MB` env var (default unlimited); server action enforces limit before streaming to disk.
- Drag-drop: use native HTML5 `dragover`/`drop` events; no extra DnD library needed for upload widget.
- Progress: `ReadableStream` from request; track bytes written; Svelte store update.
- TUI file prompt: `readline` or OpenTUI input widget; validate path exists before uploading.
