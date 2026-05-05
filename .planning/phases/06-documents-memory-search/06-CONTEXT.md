# Phase 6: Documents + Memory + Search - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers three verified pillars: (1) TipTap document editor with lossless save/load, versioning with incremental deltas, frontmatter, KaTeX, Mermaid, doc_comments threading, and tree reorder; (2) Memory engine hardened with FTS retrieval, hybrid scoring, context bundle assembly, promotion UX, and three-surface parity; (3) Unified search with expanded SearchDocument, tRPC query endpoint, PGlite FTS backend, Orama client-side search, facets, saved searches, and Cmd+K palette extension.

Requirements: DOC-01..12, MEM-01..09, SRC-01..09 (30 total).

</domain>

<decisions>
## Implementation Decisions

### Document Versioning (DOC-06)
- **D-01:** Fix `applyDelta()` in `src/docs/version-reconstructor.ts` to support ProseMirror Step replay. Currently only handles full-snapshot deltas (path=[], throws on incremental ops). New implementation: parse Step JSON array from `delta` column, apply sequentially via ProseMirror `Transform`.
- **D-02:** Storage format: `DocumentVersion.delta` stores `Step[]` JSON array (each step ~50-200 bytes). `DocumentVersion.snapshot` stores full JSON doc at periodic checkpoints (every 10th version). Reconstruction: find nearest prior snapshot, replay steps forward.
- **D-03:** Version timeline UI pattern: Confluence-style list with timestamp + author + optional restore. Add inline diff view (green/red) using `prosemirror-changeset` — this is a competitive differentiator (only Confluence has diffs, none of the modern tools do).
- **D-04:** Yjs state in `yjsState` column used for real-time collab (already exists from Phase 5). Version snapshots created from `Y.snapshot(ydoc)` when user explicitly saves or on collab session close. Yjs and ProseMirror step chains coexist — Yjs for live collab, steps for version history display.

### Document Editor Verification (DOC-01..04, DOC-07..08)
- **D-05:** TipTap is already integrated (`src/web/node_modules/`) with `contentJson` field storing rich content. Phase 6 wires it into actual editor components and verifies lossless round-trip across all `doc_type` schemas.
- **D-06:** KaTeX via `@tiptap/extension-mathematics`. Mermaid via custom NodeView extension that calls `mermaid.render()` in a code-block node. No external rendering service.
- **D-07:** `doc_type` drives toolbar config: each type (page, adr, spec, runbook, meeting_notes) gets a toolbar preset defined in a config map. Toolbar renders conditionally based on active doc_type.
- **D-08:** Wikilink verification (DOC-07): confirm `doc_links` row written on `[[page]]` syntax parse. Already implemented — needs integration test.

### Document Tree & Comments (DOC-05, DOC-09..12)
- **D-09:** Drag-drop tree reorder in doc sidebar: use `svelte-dnd-action` (already a project dependency from Phase 5 Kanban). Unlimited nesting depth matching Notion/Outline pattern. `Document.sortPosition` + `Document.parent` drive order.
- **D-10:** `doc_comments` entity already exists with `anchorRange` JSON, `parentComment` for threading, `resolved` flag. Phase 6 builds the UI: anchored inline comments (select text → comment icon) matching Confluence's pattern but with stable anchor persistence (Confluence's anchors break on revert — ours won't because we re-map anchors on version restore).
- **D-11:** `context_summary` extraction (DOC-09): on document save, extract headings tree + wikilink targets + @mentions into a structured JSON field. This feeds Pillar 8 memory context bundle (`linkedDocs` slice) and search indexing.

### Search Architecture (SRC-01..09)
- **D-12:** Dual-layer search: **Orama** (`@orama/orama` <2kb) for client-side UI search (typo tolerance, facets, highlights, <15ms at 10k docs) + **PGlite FTS** (`tsvector/tsquery`) as server-side source of truth for tRPC endpoint.
- **D-13:** Expand SearchDocument entity from 4 columns to full schema: `id`, `org_id`, `entityKind`, `entityId`, `title`, `body`, `labels[]`, `metadata` (JSONB), `updatedAt`, `projectId`, `status`, `embedding` (vector(384)). Add `tsvector` generated column on `title || ' ' || body`.
- **D-14:** tRPC search endpoint: `search.query` procedure accepts `{ term, filters: { kinds[], projectIds[], statuses[], dateRange? }, facets: boolean, limit, offset }`. Returns ranked results with snippets + facet counts.
- **D-15:** 7 existing indexers (`src/search/indexers/`) already write to SearchDocument on entity changes. Phase 6 wires them to populate the expanded columns (title, body, labels, metadata) and exposes the read-side query endpoint.
- **D-16:** Orama client-side schema mirrors SearchDocument: `{ title: 'string', body: 'string', kind: 'enum', project: 'enum', status: 'enum', updatedAt: 'number' }`. Hydration: SSR sends serialized Orama snapshot via `@orama/plugin-data-persistence`; incremental sync via `last_synced_at` polling.
- **D-17:** Facet filters: kind (doc/task/memory/run/artifact/repo/sprint), project, status, date range. Orama handles facets natively via `facets: {}` search option.
- **D-18:** Saved searches: `src/product-kernel/saved-searches.ts` already exists. Wire to tRPC endpoint for CRUD. Saved search = serialized query (term + filters) with user-assigned name.
- **D-19:** REST API search (`src/api/routes/search.ts`): replace hardcoded data with real PGlite FTS query delegating to SearchDocumentRepository.

### Cmd+K Palette Extension (SRC-07)
- **D-20:** Extend existing CommandPalette (`src/web/src/lib/components/command-palette/`) from Phase 5. Currently has fuzzy filter + agent run commands. Add: navigation commands (go to project, go to doc, go to task), creation commands (new task, new doc, new sprint), search mode (typing triggers Orama search results below commands).
- **D-21:** Linear's selection-context model: when items are selected (e.g., tasks in board/list), Cmd+K shows bulk action commands (assign, change status, move). When nothing selected, shows navigation + creation commands.
- **D-22:** Command count target: 15+ commands minimum (navigation: ~5, creation: ~4, search: integrated, bulk actions: ~6 context-dependent). Keyboard-first: arrow keys + enter, no mouse required.

### Memory Engine (MEM-01..09)
- **D-23:** MEM-01 (embedding dimension): already done in Phase 4 — `vector(384)` matching fastembed. Verify no remaining `vector(1536)` references.
- **D-24:** MEM-03 (FTS retrieval): Memory entity already has FTS index on `body`. Verify ranking: project-scoped memories ranked above global for same-project queries. Scoring: `ts_rank` weighted by `importance` field (high=3x, medium=2x, low=1x).
- **D-25:** MEM-04 (context bundle): assemble 5 slices under token budget — memories 25%, linkedDocs 20%, recentRuns 35%, repoState 10%, skillPrompts 10%. Implementation: `ContextBundleService` with per-slice retrievers, token counting via tiktoken-equivalent, greedy fill by slice priority.
- **D-26:** MEM-05 (hybrid scoring): when embeddings flag enabled, combine FTS `ts_rank` score with cosine similarity from `vector(384)` column. Weighted: 0.3 * FTS + 0.7 * cosine. Configurable via tenant settings.
- **D-27:** MEM-06 (promotion): Memory promotion (project → global) via Web UI toggle button + CLI `fulcrum memory promote <id>`. Sets `global=true`, preserves original `projectId` for audit trail.
- **D-28:** MEM-07/08 (three-surface): Web memory browser (`src/web/src/lib/memory/memory-browser.ts` exists), TUI memory search (`src/tui/screens/memory-browser.ts` exists). Verify functional, add missing CRUD parity.
- **D-29:** MEM-09 (repo state → context bundle): deferred until Phase 7 (Repos + Artifacts). Context bundle `repoState` slice returns empty/placeholder until Pillar 9 lands. Note: ROADMAP says Phase 6 depends on Phase 4 (embeddings) not Phase 7 (repos).

### Three-Surface Parity (DOC-12, MEM-09, SRC-09)
- **D-30:** Web: full doc editor + search page with facets + memory browser. CLI: `fulcrum docs list|get|create`, `fulcrum search query|suggest|saved --json`, `fulcrum memory list|get|promote`. TUI: doc viewer (read-only, no TipTap in terminal), search screen with facet chips, memory browser screen.
- **D-31:** TUI doc viewer: renders markdown from `bodyMd` field (not TipTap JSON). KaTeX/Mermaid shown as raw source blocks in TUI (no terminal rendering). Full editing only in Web surface.

### Claude's Discretion
- Planner may choose exact Orama schema field names and sync interval for incremental hydration.
- Planner may decide ProseMirror step serialization format details (raw Step JSON vs compressed).
- Planner may choose exact toolbar preset configurations per doc_type as long as each type has a distinct toolbar.
- Planner may decide search result ranking algorithm tuning parameters within the dual-layer architecture.
- Planner may choose how to batch-populate expanded SearchDocument columns from existing indexers (migration script vs lazy backfill on first query).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Pillar 7 (DOC-01..12) — Document editor requirements
- `.planning/REQUIREMENTS.md` §Pillar 8 (MEM-01..09) — Memory + context requirements
- `.planning/REQUIREMENTS.md` §Pillar 11 (SRC-01..09) — Search requirements

### Prior Phase Decisions
- `.planning/phases/04-inference-router-skills/04-CONTEXT.md` §Embedding Schema — D-05..D-08 lock embedding at vector(384), fastembed model
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — CommandPalette architecture, svelte-dnd-action patterns

### Research (this phase)
- `docs/research/competitor-doc-editor-search-patterns.md` — Notion/Linear/Confluence/Outline/Plane UX patterns for versioning, search, Cmd+K

### Codebase Starting Points
- `src/db/entities/docs/` — Document, DocumentVersion, DocLink, DocComment entities
- `src/db/entities/search/SearchDocument.ts` — 4-column stub to expand
- `src/db/entities/memory/Memory.ts` — Memory entity with embedding + FTS
- `src/search/indexers/` — 7 indexers (doc, memory, task, run, artifact, repo, sprint)
- `src/docs/version-reconstructor.ts` — `applyDelta()` function to fix (DOC-06)
- `src/web/src/lib/components/command-palette/` — Existing CommandPalette from Phase 5
- `src/product-kernel/saved-searches.ts` — Saved search CRUD (already exists)
- `src/product-kernel/search.ts` — Search service (write-side exists, needs read-side)
- `src/web/src/lib/memory/memory-browser.ts` — Web memory browser (verify functional)
- `src/tui/screens/memory-browser.ts` — TUI memory screen (verify functional)
- `src/tui/screens/search-screen.ts` — TUI search screen (verify functional)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **CommandPalette** (Phase 5): fuzzy filter, keyboard nav, agent-run commands. Extend with navigation/creation/search commands.
- **svelte-dnd-action**: already used in Kanban board. Reuse for doc tree drag-drop reorder.
- **SearchDocument + 7 indexers**: write pipeline exists. Only need to expand schema + build query endpoint.
- **Memory entity + MemoryRepository**: full CRUD with FTS index on body, embedding column, importance ranking.
- **DocumentVersion entity**: already has `delta` (JSON), `snapshot` (JSON), `yjsState` (binary) columns. Infrastructure ready for step-based versioning.
- **DocComment entity**: fully defined with anchor_range, threading, resolved flag. Needs UI wiring only.

### Established Patterns
- tRPC routers for all query/mutation endpoints (search, memory, docs all have routers)
- MikroORM entities with repositories in `src/db/repositories/`
- CLI commands in `src/cli/commands/` with `--json` flag support
- TUI screens in `src/tui/screens/` using OpenTUI JSX
- Web components in `src/web/src/lib/` with SvelteKit + shadcn-svelte

### Integration Points
- Search indexers fire on entity changes → populate expanded SearchDocument
- `context_summary` (DOC-09) → feeds `ContextBundleService` linkedDocs slice
- Inference sidecar (Phase 4) → provides embedding generation for hybrid search scoring
- Orama client hydration ← tRPC search.snapshot endpoint sends serialized index

</code_context>

<specifics>
## Specific Ideas

- **Diff view as differentiator**: Only Confluence offers version diffs. Modern tools (Notion, Linear, Outline) show snapshots only. Implement inline diff (green/red) using prosemirror-changeset — genuine competitive advantage.
- **Stable anchor persistence**: Confluence's inline comment anchors break on revert/API edit. Fulcrum re-maps anchor positions on version restore to maintain comment attachment.
- **Linear-style contextual Cmd+K**: Commands adapt based on current selection state. Selected tasks → bulk actions appear. No selection → navigation + creation commands.
- **Orama + PGlite dual layer**: Orama for instant client-side search (<15ms, typo tolerance, facets). PGlite FTS for authoritative server queries. Sync via snapshot hydration + incremental polling.

</specifics>

<deferred>
## Deferred Ideas

- **MEM-09 repo state snapshot**: Requires Phase 7 (Repos + Artifacts). Context bundle `repoState` slice returns empty until then.
- **Named versions (git-like tags on doc versions)**: No competitor does this natively. Good future feature but out of scope for DOC-06's timeline + delta fix.
- **AI-powered search (semantic + Q&A)**: Orama supports vector search but full AI Q&A (Notion-style) belongs in a future AI integration phase.
- **Meilisearch backend**: Requirements say "optional Meilisearch" — implement PGlite FTS + Orama first. Meilisearch adapter can be added in a future scaling phase.

</deferred>

---

*Phase: 6-Documents + Memory + Search*
*Context gathered: 2026-05-05*
