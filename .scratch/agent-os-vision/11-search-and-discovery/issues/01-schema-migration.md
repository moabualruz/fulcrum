---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q22, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Schema migration: search_documents table, search_clicks table, saved_views view_type extension

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Schema changes section; issues T11-01)

## What to build
Write migration `0011_search` creating: `search_documents` (denormalised write-optimised table with `tsvector GENERATED ALWAYS AS STORED`, `embedding vector(384) NULL`, GIN indexes, UNIQUE `(org_id, kind, entity_id)`); `search_clicks` (telemetry — table always exists, writes gated); and extend `saved_views` CHECK constraint to include `view_type='search'`. All composite `(org_id, …)` indexes per Q22. Idempotent — safe to re-run.

## Acceptance criteria
- [ ] Schema migration: `0011_search` applies clean twice on PGlite; all tables present; `tsvector` generated column populated on insert; GIN index on `ts_vector`; UNIQUE `(org_id, kind, entity_id)` enforced; `saved_views` CHECK constraint includes `'search'`.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate`; no procedure in this slice.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum doctor --json` reports `search_documents` table present and row count.
- [ ] TUI screen: N/A.
- [ ] Tests: migration unit test asserts all columns + indexes + UNIQUE constraint + generated column; `saved_views` with `view_type='search'` inserts without error; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — `orgs`, `users`, `projects`, `sprints` tables must exist for FK references.
- Pillar 6 (Tasks) — `saved_views` table must exist for CHECK constraint extension.

## Notes / Tech-stack hints
- `embedding vector(384)` — NULL when embeddings flag OFF per Q27; pgvector extension must be loaded in PGlite (bundled).
- `tsvector GENERATED ALWAYS AS STORED` — not supported in all PGlite WASM versions; test early; fallback: trigger-maintained `tsvector` column.
- `search_clicks` table always created; writes happen only when `search-click-telemetry` flag ON (D5).
- GIN index on `metadata` jsonb for facet queries on arbitrary metadata keys.
