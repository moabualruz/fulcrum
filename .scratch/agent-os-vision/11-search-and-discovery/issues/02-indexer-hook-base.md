---
Status: completed
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [01-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# SearchIndexHook base: upsert + remove interface, ts_vector population, idempotency tests

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-02)

## What to build
`src/search/indexers/base.ts` — abstract `SearchIndexHook` with `upsert(entityId, orgId): Promise<void>` and `remove(entityId, orgId): Promise<void>`. `upsert` uses `searchDocRepo.upsert({ ...fields }, { onConflictFields: ['orgId', 'kind', 'entityId'] })` to write/overwrite the `SearchDocument` row; `remove` calls `searchDocRepo.nativeDelete({ orgId, kind, entityId })`. Also implements `bulkReindex(orgId, kind)` graphile-worker task for re-indexing all entities of a kind (used on flag enable or migration). Validates `tsVector` is populated post-upsert via `em.find` assertion in tests.

## Acceptance criteria
- [ ] Schema migration: reads/writes `search_documents`; no new columns.
- [ ] tRPC procedure / module: `src/search/indexers/base.ts` exported class; used by all kind-specific indexers.
- [ ] Web surface: N/A (infrastructure only).
- [ ] CLI command: `fulcrum search reindex --kind task --json` triggers `bulkReindex` graphile-worker job; returns `{ queued: N }`.
- [ ] TUI screen: N/A.
- [ ] Tests: upsert idempotent (call twice → one row); remove deletes; `ts_vector` column non-null after upsert; `bulkReindex` enqueues correct job count; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `SearchDocument` entity + migration class must be applied first.
- Pillar 1 (Foundation) — graphile-worker for bulk reindex job.

## Notes / Tech-stack hints
- `upsert` must set `updated_at = now()` on conflict update.
- `bulkReindex`: fetches all entity IDs of `kind` for `orgId`; enqueues one `search.upsert` job per entity (batch of 100 via `addJobs`); returns count.
- Remove: cascade — if entity row deleted, `search_documents` row also deleted (FK `ON DELETE CASCADE` per schema); `remove()` is belt-and-suspenders for non-FK cases.
- Failure gate: if `tsVector` GENERATED column (columnType string) not supported by PGlite version → implement trigger-based maintenance via MikroORM subscriber (`@AfterInsert` / `@AfterUpdate` hook calling `em.nativeUpdate`).
