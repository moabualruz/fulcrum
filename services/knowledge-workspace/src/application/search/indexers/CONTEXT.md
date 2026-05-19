# Search Indexers

Sub-area of Search that projects each domain entity (`doc`, `task`, `memory`, `run`, `artifact`, `repo`, `sprint`) into a unified `search_documents` row so the parent **SearchBackend** can rank them with one query shape.

## Language

**IndexerHook**:
The per-`source_kind` contract — `upsert(entityId, orgId)`, `remove(entityId, orgId)`, optional `listEntityIds(orgId)` — that every concrete indexer implements.
_Avoid_: Adapter, projector, sync handler.

**SearchIndexHook**:
The abstract `@Injectable` base that templates the `search_documents` upsert/delete SQL and delegates entity-specific shape to `buildDocument`.
_Avoid_: Base indexer, abstract hook.

**buildDocument**:
The subclass-only method that loads one entity row and returns a `SearchDocumentInput` (title, body, labels, metadata) ready for the upsert template.
_Avoid_: Project, materialize, render.

**SearchDocumentInput**:
The neutral row shape — `orgId`, `projectId`, `sourceKind`, `sourceId`, `title`, `body`, `labels`, `metadata`, optional `status`/`updatedAt` — written into `search_documents` and mirrored to Meilisearch.
_Avoid_: Index document, search row.

**IndexerRegistry**:
The `@Injectable` map of `kind -> IndexerHook` with `triggerUpsert`, `triggerRemove`, and `bulkReindex` — the only entry point outer code uses; direct hook calls are forbidden.
_Avoid_: Indexer manager, hook table.

**BulkReindex**:
A `listEntityIds` walk that enqueues one `search.upsert` row per entity into the `jobs` table on queue `search`, never touching `search_documents` directly.
_Avoid_: Full sync, rebuild, backfill.

**TableColumns**:
A cached `information_schema.columns` lookup used by every `buildDocument` to tolerate optional columns (`body_md`, `assignee_id`, `metadata_json`, …) across migration generations.
_Avoid_: Schema probe, column check.

**MarkdownStrip**:
The `stripDocumentMarkdown` pass that removes frontmatter, links, headings, and list markers from a doc body before it becomes the indexed `body`, capped at 10,000 chars.
_Avoid_: Sanitize, plaintext, normalize.

## Relationships

- An **IndexerRegistry** dispatches to exactly one **IndexerHook** per `SearchIndexKind`; unknown kinds throw.
- A **SearchIndexHook** subclass overrides `kind` and `buildDocument`; the base owns the **SearchDocumentInput** validation and the `search_documents` upsert SQL.
- A `buildDocument` call reads one row from its owning table (`documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `repos`, `sprints`) gated by **TableColumns**, then returns a **SearchDocumentInput**.
- A **BulkReindex** call requires `listEntityIds` on the hook; hooks without it reject bulk reindex for that `kind`.
- A `DocumentIndexer.buildDocument` runs **MarkdownStrip** over `body_md` / `body` / `content_json` fallback chain before emitting the row.
- An upsert writes one `search_documents` row and, when configured, mirrors the same **SearchDocumentInput** to Meilisearch via `upsertMeilisearchDocument`.

## Example dialogue

> **Dev:** "If `tasks.assignee_id` doesn't exist on this branch, does the **TaskIndexer** crash?"
> **Domain expert:** "No — `buildDocument` calls **TableColumns** first and substitutes `NULL::text AS assignee_id` when the column is missing. The `search_documents` row still upserts; metadata.assignee_id is just null."
> **Dev:** "And `bulkReindex` for `artifact`?"
> **Domain expert:** "**IndexerRegistry.bulkReindex** calls `ArtifactIndexer.listEntityIds`, then enqueues one `search.upsert` job per id on queue `search`. The worker drains the queue and calls `triggerUpsert` per row — the registry never writes `search_documents` directly in a bulk path."

## Flagged ambiguities

- **"Indexer"** — covers both the concrete `*Indexer` classes and the abstract **SearchIndexHook**. Resolution: say **IndexerHook** for the contract, **SearchIndexHook** for the base class, and the explicit `DocumentIndexer` / `TaskIndexer` / etc. for concrete implementations.
- **"Document"** — overloaded between the `doc` source kind (the `documents` table) and **SearchDocumentInput** (the neutral row shape used by all kinds). Resolution: **SearchDocumentInput** for the index row; "doc" only for the `doc` kind owned by `DocumentIndexer`.
- **"Kind"** — `SearchIndexKind` (the indexer registry key) vs `documents.kind` (a legacy column read as fallback for `doc_type`). Resolution: `SearchIndexKind` for the registry key; never reuse "kind" for the column shape.
