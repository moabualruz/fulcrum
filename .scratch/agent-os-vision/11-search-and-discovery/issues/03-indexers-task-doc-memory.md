---
Status: implemented
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [02-indexer-hook-base.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Indexers: task, doc, memory — title/body/tags/metadata, wired into save handlers

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-03, T11-04, T11-05)

## What to build
Three kind-specific `SearchIndexHook` implementations, each wired into the owning pillar's save handler so `search_documents` stays current on every entity mutation:

- `TaskIndexer`: title + description + custom_fields body; metadata `{status, assignee_id, sprint_id}`; wired into `tasks.create`/`update`/`delete`.
- `DocIndexer`: title + content body + tags; metadata `{doc_type, scope}`; wired into `docs.create`/`update`/`delete` (Pillar 7 save).
- `MemoryIndexer`: title + body + tags; metadata `{importance, scope}`; wired into `memories.create`/`update`/`delete` (Pillar 8 save).

All three: upsert on save, remove on delete, re-index on bulk trigger.

## Acceptance criteria
- [ ] Schema migration: reads entity tables; upserts `search_documents`; no new entity columns.
- [ ] tRPC procedure / module: indexer wired in `tasks.*`, `docs.*`, `memories.*` tRPC procedures; no direct DB writes from outside indexer.
- [ ] Web surface: create task in Web → searchable immediately; verify via `/search?q=<title>`.
- [ ] CLI command: `fulcrum task create --title "foo bar" --json` → `fulcrum search "foo bar" --kind task --json` returns the task.
- [ ] TUI screen: create task in TUI → TUI search pane finds it.
- [ ] Tests: for each kind: create entity → `search_documents` row exists with correct title/body/ts_vector/metadata; update entity title → row updated; delete entity → row removed (or CASCADE); bulk reindex → correct count; RED→GREEN.

## Blocked by
- `02-indexer-hook-base.md` — `SearchIndexHook` base class.
- Pillar 6 (Tasks) — `tasks.*` save handlers to wire into.
- Pillar 7 (Docs) — `docs.*` save handlers.
- Pillar 8 (Memory) — `memories.*` save handlers.

## Notes / Tech-stack hints
- Each indexer lives in the owning pillar's module (e.g. `src/tasks/indexer.ts`) and imports `SearchIndexHook` from `src/search/indexers/base.ts` — avoids circular deps.
- `custom_fields` body: JSON-stringify custom field values, strip keys (search body = values only).
- `content` for docs: TipTap JSON → plain text via `@tiptap/extension-document` text serialiser.
- Wiring: add `await indexer.upsert(entity.id, orgId)` call at end of each save handler; wrap in try/catch to not fail main mutation if indexing fails (log + continue).
