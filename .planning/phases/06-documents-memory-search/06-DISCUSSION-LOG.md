# Phase 6: Documents + Memory + Search - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 06-documents-memory-search
**Mode:** --auto (fully autonomous, deep research with competitor + dependency analysis)
**Areas discussed:** Document Versioning, Search Architecture, Cmd+K Extension, Memory Engine, Three-Surface Parity, Document Editor Verification, Document Tree & Comments

---

## Document Versioning Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Full snapshots only | Store complete doc JSON per version (simple, wasteful) | |
| ProseMirror Steps + periodic snapshots | Store Step[] deltas, checkpoint every 10th version | ✓ |
| Yjs-only versioning | Use Y.snapshot exclusively (ties versioning to collab layer) | |

**Auto-selected:** ProseMirror Steps + periodic snapshots (recommended default)
**Rationale:** Existing `DocumentVersion.delta` column already stores JSON. Step replay is well-documented. Yjs used for live collab, steps for version history. Diff view via prosemirror-changeset is competitive differentiator.

---

## Search Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| PGlite FTS only | Server-side search, no client-side index | |
| Orama only | Client-side search, no server query endpoint | |
| Dual-layer (Orama + PGlite FTS) | Client for instant UI, server for authoritative queries | ✓ |
| Meilisearch | External search server | |

**Auto-selected:** Dual-layer Orama + PGlite FTS (recommended default)
**Rationale:** Orama <2kb bundle, <15ms at 10k docs, native facets + typo tolerance. PGlite FTS already available (no new dependency for server). Meilisearch deferred — overkill for local-first <10k scale.

---

## Cmd+K Palette Model

| Option | Description | Selected |
|--------|-------------|----------|
| Search-first (Notion) | Cmd+K opens search, commands secondary | |
| Command-first (Linear) | Cmd+K shows context-aware commands, search integrated | ✓ |
| Hybrid flat (Outline) | Mixed list of commands + search results | |

**Auto-selected:** Command-first with context awareness (Linear model)
**Rationale:** Linear's selection-context pattern is strongest UX. Existing CommandPalette already has command infrastructure. Add search as integrated mode within same overlay.

---

## Memory Hybrid Scoring

| Option | Description | Selected |
|--------|-------------|----------|
| FTS only | ts_rank scoring, no vector similarity | |
| Vector only | Cosine similarity on embeddings | |
| Hybrid weighted (0.3 FTS + 0.7 cosine) | Combine both when embeddings enabled | ✓ |

**Auto-selected:** Hybrid weighted scoring (recommended default)
**Rationale:** MEM-05 requires embeddings flag toggle. Hybrid gives best relevance. Weights configurable via tenant settings for tuning.

---

## Context Bundle Assembly

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed allocation | Hard percentages per slice | ✓ |
| Dynamic priority | Allocate based on query relevance | |
| Greedy fill | Fill highest-priority slice first | |

**Auto-selected:** Fixed allocation with greedy fill within slices (per MEM-04 spec)
**Rationale:** Requirements explicitly specify: memories 25%, linkedDocs 20%, recentRuns 35%, repoState 10%, skillPrompts 10%. Follow spec exactly.

---

## Claude's Discretion

- Orama schema field names and sync polling interval
- ProseMirror step serialization compression details
- Toolbar preset configs per doc_type (as long as each type is distinct)
- Search ranking parameter tuning within dual-layer architecture
- SearchDocument backfill strategy (migration vs lazy)

## Deferred Ideas

- MEM-09 repo state → Phase 7 dependency
- Named versions (git-like tags on docs) → future feature
- AI-powered semantic Q&A search → future AI phase
- Meilisearch backend adapter → future scaling phase

## Research Agents Dispatched

1. **Competitor analysis** — Notion, Linear, Confluence, Outline, Plane (doc editor, versioning, search, Cmd+K patterns)
2. **Dependency research** — @orama/orama, TipTap extensions, PGlite FTS, prosemirror-changeset, Yjs snapshots
3. **Codebase scout** — Existing entities, indexers, CommandPalette, applyDelta state, doc_comments
