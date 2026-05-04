---
Status: completed
Triage: AFK
Pillar: search-and-discovery
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q22, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Migration class: SearchDocument entity, SearchClick entity, SavedView.viewType enum extension

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Schema changes section; issues T11-01)

## What to build
Create MikroORM entity classes and auto-generate migration class `Migration<timestamp>` (via `mikro-orm migration:create`) covering:
- `SearchDocument` entity (`src/db/entities/search/SearchDocument.ts`) — denormalised write-optimised table with `tsVector` GENERATED column (sanctioned single `columnType` string per C6), `embedding vector(384) NULL`, GIN indexes via `@Index({ expression: "gin(...)" })` decorators, `@Unique({ properties: ['orgId', 'kind', 'entityId'] })`.
- `SearchClick` entity (`src/db/entities/search/SearchClick.ts`) — telemetry table always exists; writes gated behind `search-click-telemetry` flag.
- `SavedView.viewType` enum extended to include `'search'` on the existing `SavedView` entity (P6-owned entity; P11 migration class adds enum value).
All composite `(org_id, …)` indexes per Q22. Migration idempotent — MikroORM snapshot-based diff.

## Acceptance criteria
- [ ] Migration class applies clean twice on PGlite via `fulcrum db migrate`; all entity tables present; `ts_vector` generated column populated on insert; GIN index on `ts_vector`; `@Unique` on `(org_id, kind, entity_id)` enforced; `SavedView.viewType` accepts `'search'`.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate`; no procedure in this slice.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum doctor --json` reports `search_documents` entity table present and row count.
- [ ] TUI screen: N/A.
- [ ] Tests: migration unit test asserts all properties + indexes + unique constraint + generated column via `em.find` / `em.count`; `SavedView` with `viewType: 'search'` persists without error; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — `Org`, `User`, `Project`, `Sprint` entities must exist for ManyToOne relations.
- Pillar 6 (Tasks) — `SavedView` entity must exist for enum extension.

## Notes / Tech-stack hints
- `embedding vector(384)` — `@Property({ type: VectorType, length: 384, nullable: true })` from `pgvector/mikro-orm`; NULL when `embeddings` flag OFF per Q27; pgvector extension loaded in PGlite at boot (bundled).
- `tsVector` GENERATED column: `@Property({ columnType: "tsvector GENERATED ALWAYS AS (...) STORED", persist: false })` — sanctioned single DDL-string-per-column escape per C6; test early on PGlite WASM; fallback: trigger-maintained column if PGlite version lacks GENERATED support.
- `SearchClick` entity always created; `@Injectable() SearchClickService` writes only when `search-click-telemetry` flag ON (D5).
- GIN index on `metadata` jsonb for facet queries: `@Index({ expression: "gin(metadata)" })` — sanctioned per C6.
