---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [02-indexer-hook-base.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q25]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Indexers: run, artifact, repo, project, sprint — wired into after_run/harvest/save handlers

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-06, T11-07, T11-08)

## What to build
Five more kind-specific `SearchIndexHook` implementations:

- `RunIndexer`: transcript_summary + status body; metadata `{status, task_id, agent}`; wired into Pillar 3 run-complete handler.
- `ArtifactIndexer`: filename + metadata preview body; metadata `{mime, project_id}`; wired into Pillar 10 `artifact.harvest` job completion.
- `RepoIndexer`: name + description + default_branch; wired into Pillar 9 repo save.
- `ProjectIndexer`: name + description; wired into `projects.create`/`update`/`delete`.
- `SprintIndexer`: name + goal; wired into `sprints.create`/`update`/`delete`.

All five: same upsert-on-save / remove-on-delete / bulk-reindex pattern.

## Acceptance criteria
- [ ] Schema migration: reads all five entity tables; upserts `search_documents`; no new columns.
- [ ] tRPC procedure / module: indexers wired in respective pillar save handlers; bulk reindex works for each kind.
- [ ] Web surface: after agent run completes, run appears in `/search?q=<task-title> --kind run`; harvested artifact appears in `/search?kind=artifact`.
- [ ] CLI command: `fulcrum search "myproject" --kind project --json` returns project; `fulcrum search "sprint-1" --kind sprint --json` returns sprint.
- [ ] TUI screen: search pane returns results from all 5 kinds after creation.
- [ ] Tests: for each kind: create entity → row in `search_documents`; update → row updated; delete entity → row removed; `kind` column correct; RED→GREEN.

## Blocked by
- `02-indexer-hook-base.md` — base class.
- Pillar 3 (Symphony) — run-complete hook to wire `RunIndexer`.
- Pillar 9 (Repos) — repo save handler.
- Pillar 10 (Artifacts) — `artifact.harvest` job for `ArtifactIndexer`.

## Notes / Tech-stack hints
- `transcript_summary`: use first 500 chars of transcript JSONL (or `agent_runs.status` + `agent` name if transcript not available yet).
- Wiring into Pillar 3/9/10 may require cross-pillar dependency injection; use event-based hook (emit `run.completed` → indexer subscribes) to avoid tight coupling.
- `ProjectIndexer` wired at project create/update in Pillar 1 Foundation procedures.
