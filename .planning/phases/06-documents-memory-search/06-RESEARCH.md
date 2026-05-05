# Phase 6: Documents + Memory + Search - Research

**Researched:** 2026-05-05
**Domain:** TipTap doc editor, ProseMirror versioning, Orama search, Memory retrieval, Cmd+K palette
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Document Versioning (DOC-06)**
- D-01: Fix `applyDelta()` in `src/docs/version-reconstructor.ts` to support ProseMirror Step replay. Parse Step JSON array from `delta` column, apply sequentially via ProseMirror `Transform`.
- D-02: `DocumentVersion.delta` stores `Step[]` JSON array. `DocumentVersion.snapshot` stores full JSON doc every 10th version. Reconstruction: nearest prior snapshot + replay steps forward.
- D-03: Confluence-style version timeline with timestamp + author + optional restore. Inline diff (green/red) using `prosemirror-changeset`.
- D-04: Yjs for live collab, ProseMirror steps for version history display. Coexist in same entity.

**Document Editor (DOC-01..04, DOC-07..08)**
- D-05: TipTap already integrated; wire into editor components and verify lossless round-trip.
- D-06: KaTeX via `@tiptap/extension-mathematics`. Mermaid via custom NodeView extension calling `mermaid.render()` in a code-block node.
- D-07: `doc_type` drives toolbar config via preset map.
- D-08: Wikilink → `doc_links` row write verified via integration test.

**Document Tree & Comments (DOC-05, DOC-09..12)**
- D-09: Drag-drop tree reorder via `svelte-dnd-action` (already a project dependency). Unlimited nesting.
- D-10: `doc_comments` entity already exists; build inline comment UI with stable anchor re-mapping on version restore.
- D-11: `context_summary` extraction on save: headings + wikilink targets + @mentions → structured JSON field.

**Search Architecture (SRC-01..09)**
- D-12: Dual-layer: Orama client-side (<15ms, typo tolerance, facets) + PGlite FTS server-side source of truth.
- D-13: Expand SearchDocument to: `id, org_id, entityKind, entityId, title, body, labels[], metadata (JSONB), updatedAt, projectId, status, embedding vector(384)`. Add `tsvector` generated column.
- D-14: tRPC `search.query` procedure: `{ term, filters: { kinds[], projectIds[], statuses[], dateRange? }, facets: boolean, limit, offset }`.
- D-15: 7 existing indexers already write. Phase 6 populates expanded columns + exposes read-side query endpoint.
- D-16: Orama schema mirrors SearchDocument. Hydration via SSR serialized snapshot (`@orama/plugin-data-persistence`) + incremental `last_synced_at` polling.
- D-17: Facets: kind, project, status, date range — Orama native facets via `facets: {}` option.
- D-18: Saved searches: `src/product-kernel/saved-searches.ts` already exists; wire to tRPC.
- D-19: Replace hardcoded data in `src/api/routes/search.ts` with real PGlite FTS.

**Cmd+K Palette (SRC-07)**
- D-20: Extend existing CommandPalette from Phase 5. Add: navigation commands (go to project/doc/task), creation commands (new task/doc/sprint), search mode (Orama results below commands).
- D-21: Linear selection-context model: selected items → bulk actions; no selection → navigation + creation.
- D-22: 15+ commands minimum. Keyboard-first: arrow + enter.

**Memory Engine (MEM-01..09)**
- D-23: MEM-01 (vector(384)) already done in Phase 4. Verify no remaining `vector(1536)` references.
- D-24: MEM-03 FTS: project-scoped ranked above global. `ts_rank` weighted by `importance` (high=3x, medium=2x, low=1x).
- D-25: MEM-04 ContextBundleService: 5 slices — memories 25%, linkedDocs 20%, recentRuns 35%, repoState 10%, skillPrompts 10%. Per-slice retrievers + token counting + greedy fill.
- D-26: MEM-05 hybrid scoring: 0.3 FTS + 0.7 cosine (configurable via tenant settings).
- D-27: MEM-06 promotion: Web UI toggle + CLI `fulcrum memory promote <id>`. Sets `global=true`, preserves `projectId`.
- D-28: MEM-07/08: Web and TUI memory browsers exist — verify and add missing CRUD parity.
- D-29: MEM-09 repoState slice returns empty/placeholder until Phase 7.

**Three-Surface Parity (DOC-12, MEM-09, SRC-09)**
- D-30: Web: full editor + search + memory browser. CLI: `fulcrum docs/search/memory` with `--json`. TUI: doc viewer (read-only), search with facets, memory browser.
- D-31: TUI renders `bodyMd`, not TipTap JSON. KaTeX/Mermaid shown as raw source blocks in TUI.

### Claude's Discretion
- Exact Orama schema field names and sync interval for incremental hydration.
- ProseMirror step serialization format details.
- Exact toolbar preset configurations per doc_type.
- Search result ranking algorithm tuning parameters.
- Migration strategy: backfill existing SearchDocument rows (migration script vs lazy backfill on first query).

### Deferred Ideas (OUT OF SCOPE)
- MEM-09 repo state snapshot (requires Phase 7).
- Named versions (git-like tags on doc versions).
- AI-powered search (semantic Q&A).
- Meilisearch backend.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOC-01 | TipTap editor save+load verified lossless across all doc types | TipTap 3.22.5 + svelte-tiptap 3.0.1 already installed; `contentJson` field on Document entity exists |
| DOC-02 | Frontmatter form verified across all doc_type schemas | `frontmatter` JSON column + `docType` enum exist; BUG-05 already fixed round-trip |
| DOC-03 | KaTeX math rendering verified in editor and read-only view | `@tiptap/extension-mathematics` 3.22.5 on npm (not yet in web/package.json — must install) |
| DOC-04 | Mermaid diagram rendering verified end-to-end | `mermaid` 11.14.0 on npm (not yet installed); custom TipTap NodeView pattern needed |
| DOC-05 | Drag-drop tree reorder in doc sidebar | `svelte-dnd-action ^0.9.69` already in web/package.json; Document.sortPosition + Document.parent exist |
| DOC-06 | Version timeline UI + fix `applyDelta()` for incremental ops | `prosemirror-changeset` 2.4.1 on npm (not installed); ProseMirror Transform via `@tiptap/pm` already installed |
| DOC-07 | Wikilink writes doc_links row verified | DocLink entity + wikilink-extractor.ts exist; needs integration test |
| DOC-08 | doc_type drives distinct toolbar configurations verified | docType enum: spec/adr/wiki/runbook/meeting/postmortem/rfc/note/scratch |
| DOC-09 | context_summary extraction on save | No existing implementation found; new `context_summary` JSONB column + extraction service needed |
| DOC-10 | Read-only render via remark + unified + shiki + DOMPurify verified | Verify existing sanitize.ts + renderer |
| DOC-11 | doc_comments entity with anchored comments, threading, resolve | DocComment entity fully defined; tRPC stub router exists; needs real implementation |
| DOC-12 | Three-surface parity for docs | DocsTreeScreen + DocsReaderEditorScreen exist in TUI; web editor needs wiring |
| MEM-01 | vector(384) column, no remaining vector(1536) references | Memory.ts already vector(384); audit needed |
| MEM-02 | Heuristic extractor produces memory rows verified | extractor-heuristic.ts exists |
| MEM-03 | FTS retrieval ranks project + global rows correctly | MemoryRepository.searchProjectAndGlobal() exists with FTS; importance scoring exists |
| MEM-04 | Context bundle 5 slices under token budget | No ContextBundleService found — new implementation needed |
| MEM-05 | Embeddings flag toggles hybrid scoring path | hybrid-scoring.ts exists but uses 0.6/0.4 weights; must update to 0.3/0.7 per D-26 |
| MEM-06 | Memory promotion project → global via Web + CLI | promote() caller in TUI memory browser exists; Web UI and CLI need implementation |
| MEM-07 | Web memory browser functional | memory-browser.ts (web lib) + memories tRPC router exists (stub) |
| MEM-08 | TUI memory search functional | MemoryBrowserScreen exists; caller wiring to tRPC needed |
| MEM-09 | Repo state snapshot fed to context bundle | Deferred — returns empty placeholder |
| SRC-01 | SearchDocument fully populated with expanded columns | SearchDocument entity is 4-column stub; requires migration + MikroORM entity expansion |
| SRC-02 | Search tRPC query endpoint | searchRouter.query is stub returning []; needs real implementation |
| SRC-03 | Unified FTS across all entity kinds | 7 indexers already write; query-side wiring to new expanded columns needed |
| SRC-04 | Orama in-browser <100ms at 10k items | @orama/orama 3.1.18 + @orama/plugin-data-persistence 3.1.18 on npm (not yet installed) |
| SRC-05 | Facet filters across kind, project, status, date range | Orama native facets API |
| SRC-06 | Saved search round-trips | saved-searches.ts in product-kernel uses ProductDb raw SQL; has DDL in request handler (violation) |
| SRC-07 | Cmd+K opens on shortcut, dispatches 10+ commands | CommandPalette + makeKeydownHandler already exist; CmdkPaletteCache + CmdkCommand interfaces defined |
| SRC-08 | REST API search returns real results | Needs replace hardcoded data with SearchDocumentRepository calls |
| SRC-09 | Three-surface parity for search | search-screen.ts TUI exists; CLI stubs exist |
</phase_requirements>

---

## Summary

Phase 6 is heavy on wiring existing infrastructure to real implementations rather than building from scratch. The entity schema (Document, DocVersion, DocComment, Memory, SearchDocument), indexers, TUI screens, and CommandPalette are all in place. The bulk of work is: (1) expand SearchDocument from 4 to 13 columns + add tRPC query endpoint, (2) fix `applyDelta()` for ProseMirror step replay + build version timeline UI, (3) install 4 missing npm packages (extension-mathematics, mermaid, prosemirror-changeset, orama + plugin), (4) implement ContextBundleService from scratch, (5) replace stub tRPC routers for documents/memories/search with real implementations, and (6) wire CLI commands.

**Critical conflict discovered:** `hybrid-scoring.ts` uses 0.6 BM25 + 0.4 cosine. D-26 locks to 0.3 FTS + 0.7 cosine. Must update hybrid scoring weights as part of MEM-05.

**Primary recommendation:** Wave 0 installs packages + migration. Waves 1-3 parallel across doc editor, memory engine, search/Cmd+K. All stubs replaced before Wave 4 (three-surface parity + tests).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TipTap editor save/load | Frontend (SvelteKit) | API (tRPC documents router) | Editor state is browser-side; persistence via tRPC mutation |
| ProseMirror step versioning | API (service layer) | Database | Step replay is server-side computation; DocVersion rows in DB |
| KaTeX rendering | Frontend (browser) | — | @tiptap/extension-mathematics renders in browser DOM |
| Mermaid rendering | Frontend (browser) | — | mermaid.render() is browser/JS; NodeView runs in TipTap |
| Doc tree drag-drop | Frontend (browser) | API (tRPC sortPosition update) | svelte-dnd-action is browser; sortPosition persisted via tRPC |
| doc_comments threading | API (tRPC + service) | Database | Comment CRUD + anchor mapping are server operations |
| context_summary extraction | API (service, on save) | Database (JSONB column) | Headings/wikilinks extracted server-side on document save |
| SearchDocument expansion | Database (migration) | API (indexers + query endpoint) | Schema change first; indexers write; tRPC reads |
| Orama client-side search | Frontend (browser) | API (tRPC snapshot endpoint) | Orama index lives in browser memory; seeded from server snapshot |
| PGlite FTS search | API (tRPC query) | Database (tsvector column) | tsquery runs in PGlite via tRPC procedure |
| ContextBundleService | API (service layer) | Database | Slice assembly + token counting is server-side |
| Hybrid memory scoring | API (service layer) | Inference sidecar | Cosine similarity computation server-side using fastembed vectors |
| Cmd+K palette commands | Frontend (browser) | API (tRPC per command) | Palette state is browser; each command dispatches tRPC call |
| Memory promotion | API (tRPC mutation) | Database | global flag toggle is a server write |

---

## Standard Stack

### Core (VERIFIED — npm registry)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiptap/core` | 3.22.5 | Rich text editor framework | Already installed; svelte-tiptap 3.0.1 bridge |
| `@tiptap/pm` | 3.22.5 | ProseMirror access via TipTap | Already installed; exposes Transform + Step |
| `@tiptap/extension-mathematics` | 3.22.5 | KaTeX math in TipTap | Official extension; matches TipTap version in lockstep |
| `mermaid` | 11.14.0 | Diagram rendering | Industry standard; custom TipTap NodeView wraps it |
| `prosemirror-changeset` | 2.4.1 | Compute diffs between ProseMirror docs | Official ProseMirror library for version diff view |
| `@orama/orama` | 3.1.18 | In-browser FTS + facets | <2kb gzipped; typo-tolerant; facets native |
| `@orama/plugin-data-persistence` | 3.1.18 | Serialize/deserialize Orama index | SSR snapshot → browser hydration |
| `svelte-dnd-action` | ^0.9.69 | Drag-drop reorder | Already installed; used by Kanban |
| `katex` | 0.16.45 | KaTeX render (peer dep of tiptap-mathematics) | Already available on npm |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prosemirror-state` | 1.4.4 | ProseMirror state model | Required by step replay in version-reconstructor |
| `prosemirror-transform` | 1.12.0 | Apply Steps to doc | Core of D-01 applyDelta fix |
| `svelte-tiptap` | 3.0.1 | Svelte wrapper for TipTap | Already installed; use for editor component |

### Packages NOT yet installed in web/package.json (VERIFIED — registry check)

```
@tiptap/extension-mathematics   (3.22.5 on npm — not in web/package.json)
mermaid                         (11.14.0 — not in web/package.json)
prosemirror-changeset           (2.4.1 — not in web/package.json)
@orama/orama                    (3.1.18 — not in web/package.json)
@orama/plugin-data-persistence  (3.1.18 — not in web/package.json)
```

**Installation (Wave 0):**
```bash
cd src/web && bun add @tiptap/extension-mathematics mermaid prosemirror-changeset @orama/orama @orama/plugin-data-persistence
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                               API Server (Bun/Hono)              PGlite
──────────────────────────────        ──────────────────────────          ──────────
TipTap Editor                         tRPC documents router               documents
  ├─ @tiptap/extension-mathematics      ├─ list/get/create/update            doc_versions
  ├─ Mermaid NodeView                   ├─ versions.list/restore             doc_links
  └─ Collab (Yjs/Hocuspocus)     →      └─ comments.list/create             doc_comments
                                                                             memories
                                       tRPC memories router        →        search_documents
Orama Index (in-memory)                  ├─ list/get/create/update
  ├─ seeded via SSR snapshot     ←        ├─ promote
  ├─ incremental sync polling             └─ search (FTS)
  └─ <15ms facet query                                                tsvector generated col
                                       tRPC search router
Cmd+K Palette                            ├─ query (PGlite FTS)      →    ts_rank queries
  ├─ navigation commands         ←        ├─ suggest
  ├─ creation commands                    ├─ savedList/Create/Update/Delete
  ├─ bulk actions (context)               └─ recordClick
  └─ Orama search results
                                       ContextBundleService
                                         ├─ memories slice (25%)    →    MemoryRepository
                                         ├─ linkedDocs slice (20%)  →    DocumentRepository
                                         ├─ recentRuns slice (35%)  →    AgentRunRepository
                                         ├─ repoState (10%)         →    EMPTY (Phase 7)
                                         └─ skillPrompts (10%)      →    SkillRepository

                                       Inference sidecar (Phase 4)
                                         └─ embed() → vector(384)   →    Memory.embedding
                                                                          SearchDocument.embedding
```

### Recommended Project Structure (additions)

```
src/
├─ docs/
│   ├─ version-reconstructor.ts     # FIX: add ProseMirror step replay
│   ├─ context-summary-extractor.ts # NEW: extract headings/wikilinks/@mentions
│   └─ collab/                      # Existing Hocuspocus/Yjs collab
├─ memory/
│   ├─ context-bundle-service.ts    # NEW: 5-slice ContextBundleService
│   └─ retrieval/
│       └─ hybrid-scoring.ts        # UPDATE: 0.6/0.4 → 0.3/0.7 weights
├─ search/
│   ├─ query-service.ts             # NEW: read-side PGlite FTS query
│   └─ indexers/                    # UPDATE: populate expanded columns
├─ db/
│   ├─ entities/search/
│   │   └─ SearchDocument.ts        # EXPAND: 4 → 13 columns
│   └─ migrations/
│       └─ Migration206XXX...ts     # NEW: SearchDocument expansion + tsvector
├─ trpc/routers/
│   ├─ documents.ts                 # REPLACE STUB: full CRUD
│   ├─ memories.ts                  # REPLACE STUB: full CRUD + promote + search
│   ├─ search.ts                    # REPLACE STUB query/suggest
│   ├─ doc-versions.ts              # REPLACE STUB: list/get/restore
│   └─ doc-comments.ts             # REPLACE STUB: full CRUD
└─ web/src/lib/
    ├─ components/command-palette/   # EXTEND: navigation/creation/search/bulk commands
    ├─ docs/
    │   ├─ TiptapEditor.svelte       # NEW/WIRE: editor component
    │   ├─ DocVersionTimeline.svelte # NEW: version history UI
    │   ├─ DocCommentPanel.svelte    # NEW: anchored comments UI
    │   └─ DocsSidebar.svelte        # WIRE: drag-drop tree
    └─ search/
        └─ OramaIndex.ts             # NEW: client Orama instance + hydration
```

### Pattern 1: ProseMirror Step Replay (D-01)

**What:** Fix `applyDelta()` to parse `Step[]` JSON and apply via `prosemirror-transform` Transform.

**Current code** (throws on incremental — only handles full-snapshot ops):
```typescript
// src/docs/version-reconstructor.ts — current (broken for incremental)
function applyDelta(base, delta) {
  const ops = delta?.ops;
  const first = ops?.[0];
  if (first && first.path.length === 0 && first.value) {
    return jsonClone(first.value); // only handles full snapshot replacement
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unsupported..." });
}
```

**New pattern** (Step JSON array replay via `@tiptap/pm`):
```typescript
// Source: ProseMirror docs + @tiptap/pm re-exports prosemirror-transform
import { Node, Schema } from "@tiptap/pm/model";
import { Transform, Step } from "@tiptap/pm/transform";
import { defaultMarkdownSchema } from "prosemirror-markdown"; // or doc schema

function applyDelta(
  base: Record<string, unknown>,
  delta: Record<string, unknown> | null,
  schema: Schema,
): Record<string, unknown> {
  const ops = (delta as StoredDelta | null)?.ops;
  const first = ops?.[0];
  // Legacy: full-snapshot op (path=[])
  if (first && Array.isArray(first.path) && first.path.length === 0 && first.value) {
    return jsonClone(first.value as Record<string, unknown>);
  }
  // New: ProseMirror Step JSON array stored in delta.steps[]
  const steps = (delta as { steps?: unknown[] } | null)?.steps;
  if (Array.isArray(steps) && steps.length > 0) {
    const doc = Node.fromJSON(schema, base);
    const tr = new Transform(doc);
    for (const stepJson of steps) {
      const step = Step.fromJSON(schema, stepJson as never);
      tr.step(step);
    }
    return tr.doc.toJSON() as Record<string, unknown>;
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unsupported document version delta." });
}
```

**Schema acquisition:** TipTap editor exposes `editor.schema` at save time. Store schema reference or use the default TipTap starter-kit schema (which is stable per version).

### Pattern 2: Orama Client-Side Index (D-12, D-16)

**What:** Seed Orama from server snapshot, search in browser, sync incrementally.

```typescript
// Source: [VERIFIED: @orama/orama 3.1.18 npm registry]
// src/web/src/lib/search/OramaIndex.ts
import { create, insert, search, type Orama } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";

const schema = {
  title: "string",
  body: "string",
  kind: "enum",
  projectId: "string",
  status: "string",
  updatedAt: "number",
  entityId: "string",
} as const;

type OramaSchema = typeof schema;

export class FulcrumOramaIndex {
  private db!: Orama<OramaSchema>;

  async hydrate(serialized: string): Promise<void> {
    this.db = await restore("json", serialized) as Orama<OramaSchema>;
  }

  async query(term: string, filters?: { kind?: string; projectId?: string }) {
    return search(this.db, {
      term,
      properties: ["title", "body"],
      where: {
        ...(filters?.kind ? { kind: { eq: filters.kind } } : {}),
        ...(filters?.projectId ? { projectId: { eq: filters.projectId } } : {}),
      },
      facets: {
        kind: {},
        status: {},
      },
      limit: 20,
    });
  }

  async serialize(): Promise<string> {
    return persist(this.db, "json") as unknown as string;
  }
}
```

### Pattern 3: ContextBundleService (D-25)

**What:** Assemble 5 slices under token budget with greedy fill.

```typescript
// NEW: src/memory/context-bundle-service.ts
// [ASSUMED] — no existing implementation found; pattern derived from D-25 spec

const TOTAL_TOKEN_BUDGET = 8000; // [ASSUMED] — tune per tenant settings
const SLICE_BUDGETS = {
  memories: 0.25,
  linkedDocs: 0.20,
  recentRuns: 0.35,
  repoState: 0.10,       // returns empty until Phase 7
  skillPrompts: 0.10,
};

// Rough token estimate: chars / 4 (GPT-style)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ContextBundleService {
  async assemble(ctx: BundleContext): Promise<ContextBundle> {
    const budget = TOTAL_TOKEN_BUDGET;
    const slices: Record<string, unknown[]> = {};

    for (const [name, fraction] of Object.entries(SLICE_BUDGETS)) {
      const sliceBudget = Math.floor(budget * fraction);
      slices[name] = await this.fillSlice(name, ctx, sliceBudget);
    }
    return slices as ContextBundle;
  }
}
```

### Pattern 4: Cmd+K Extension (D-20..22)

**What:** Add navigation/creation/search/bulk commands to existing CommandPalette.

```typescript
// src/web/src/lib/components/command-palette/navigation-commands.ts
// Extends existing CommandItem pattern from command-palette-filter.ts

import type { CommandItem } from "./command-palette-filter";

export function makeNavigationCommands(projects: { id: string; name: string }[]): CommandItem[] {
  return projects.map(p => ({
    id: `nav-project-${p.id}`,
    label: `Go to project: ${p.name}`,
    category: "navigation",
    href: `/projects/${p.id}`,
  }));
}

export function makeCreationCommands(projectId: string | null): CommandItem[] {
  return [
    { id: "create-task", label: "New task", category: "creation", action: "tasks.create" },
    { id: "create-doc", label: "New document", category: "creation", action: "documents.create" },
    { id: "create-sprint", label: "New sprint", category: "creation", action: "sprints.create" },
  ];
}

export function makeBulkCommands(selectedTaskIds: string[]): CommandItem[] {
  if (selectedTaskIds.length === 0) return [];
  return [
    { id: "bulk-assign", label: `Assign ${selectedTaskIds.length} tasks`, category: "bulk", action: "tasks.bulkAssign" },
    { id: "bulk-status", label: `Change status (${selectedTaskIds.length})`, category: "bulk", action: "tasks.bulkStatus" },
  ];
}
```

### Anti-Patterns to Avoid

- **DDL in request handlers:** `saved-searches.ts` has `ALTER TABLE` in `ensureSavedSearchColumns()` — violates ARCH-11. Must remove; column additions go in migration files.
- **ProductDb raw SQL in services:** `saved-searches.ts` uses `ProductDb.query()` directly — violates ARCH-02. Must migrate to tRPC service + MikroORM repository.
- **Orama schema mismatch:** Orama index schema must exactly mirror SearchDocument columns. Adding columns to DB without updating Orama schema causes silent hydration failures.
- **ProseMirror schema mismatch on step replay:** Steps serialized with one schema version cannot be applied with a different schema. Pin TipTap version before step serialization.
- **Mermaid async in NodeView:** `mermaid.render()` is async but TipTap NodeView `toDOM` is synchronous. Must use `viewMount`/update lifecycle or a `<figure>` placeholder + async render callback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-browser search with typo tolerance + facets | Custom trie or inverted index | `@orama/orama` | Orama handles Unicode normalization, stemming, BM25, facets, sub-10ms at 10k |
| ProseMirror doc diff | JSON diff (jsondiff/jsdiff) | `prosemirror-changeset` | Docs are trees; structural diff produces correct add/remove ranges; text diff produces wrong results for node moves |
| Yjs state serialization | Custom binary format | `Y.snapshot()` / `yDoc.encodeStateAsUpdate()` | Yjs binary format is self-describing; hand-rolling causes corruption on concurrent edits |
| Token counting | chars/4 estimate in production | `tiktoken` or `gpt-tokenizer` | Estimation error compounds over 8k budgets; actual tokenizer needed for accurate slice allocation |
| KaTeX rendering in TipTap | Custom math block extension | `@tiptap/extension-mathematics` | Official extension handles inline + block, cursor handling, LaTeX parse errors |

**Key insight:** ProseMirror's step-based history is a well-solved problem with official libraries. Avoid reimplementing step application, changeset diff, or version replay — each has subtle concurrency and schema-evolution edge cases.

---

## Common Pitfalls

### Pitfall 1: tsvector Generated Column Migration Syntax
**What goes wrong:** PGlite and PostgreSQL support `GENERATED ALWAYS AS` for `tsvector` columns differently. PGlite may need expression index instead.
**Why it happens:** PGlite is a subset of PostgreSQL; not all generated column expressions are supported.
**How to avoid:** Use a separate `GIN` index on `to_tsvector(...)` expression rather than a generated column — same query performance, broader compatibility. Already used in `memories_body_tsv` index (confirmed pattern).
**Warning signs:** Migration runs on PGlite in CI but fails on PostgreSQL (or vice versa) — always test both.

### Pitfall 2: Orama Schema Type Constraints
**What goes wrong:** Orama `enum` fields accept exact string matches only. Passing `null` or `undefined` to an enum field silently drops the document from search results.
**Why it happens:** Orama's type system is strict at index time.
**How to avoid:** Normalize SearchDocument rows before insert: replace null status/kind with a sentinel string (e.g. `"none"`).
**Warning signs:** Orama returns fewer results than PGlite FTS for equivalent query.

### Pitfall 3: ProseMirror Step Serialization Schema Lock
**What goes wrong:** Steps serialized with TipTap 3.22.5's schema cannot be replayed if TipTap upgrades change node types.
**Why it happens:** `Step.fromJSON(schema, json)` validates against schema at replay time.
**How to avoid:** Snapshot every N versions (D-02 mandates every 10th). Replay window ≤ 10 steps. On TipTap upgrade, force a full snapshot on next save.
**Warning signs:** Version restore throws `RangeError: Unknown node type` on old deltas.

### Pitfall 4: Cmd+K Selection Context Race
**What goes wrong:** Bulk action commands appear when `selectedTaskIds.length > 0` but selection state is managed at board level. Palette opened from a different route has empty selection.
**Why it happens:** Selection state is local to the board component; Cmd+K is a global overlay.
**How to avoid:** Selection state must live in a Svelte store (not component state) so Cmd+K can read it globally.
**Warning signs:** Bulk commands appear/disappear inconsistently.

### Pitfall 5: saved-searches.ts ARCH Violations
**What goes wrong:** Existing `saved-searches.ts` uses `ProductDb.query()` (raw SQL) and `ALTER TABLE` in `ensureSavedSearchColumns()` (DDL in request path). Both violate ARCH-02 and ARCH-11.
**How to avoid:** Phase 6 must migrate `saved_searches` to: (a) MikroORM SavedSearch entity, (b) migration for new columns, (c) SavedSearchRepository, (d) service wired via tRPC. Do NOT wire the existing functions directly to tRPC.
**Warning signs:** tRPC savedCreate/savedList works locally but CI migration gate fails on clean DB.

### Pitfall 6: Hybrid Scoring Weight Conflict
**What goes wrong:** `src/memory/retrieval/hybrid-scoring.ts` currently uses `BM25_WEIGHT = 0.6` and `COSINE_WEIGHT = 0.4`. D-26 locks to 0.3/0.7.
**How to avoid:** Update the constants in `hybrid-scoring.ts` as part of MEM-05. Existing tests for hybrid scoring will need expected score updates.
**Warning signs:** MEM-05 verification tests pass with old weights but D-26 compliance check fails.

### Pitfall 7: Document.title Column Missing
**What goes wrong:** `Document` entity has no `title` column — search indexer builds title from `frontmatter.title` or `bodyMd` first line. Version timeline UI has nowhere to display doc title from the version row itself.
**Why it happens:** Schema audit gap — title is derived, not stored.
**How to avoid:** Verify indexer's title extraction logic. Document entity may need a `title` column, or title must be fetched from Document when displaying version timeline (JOIN).
**Warning signs:** SearchDocument.title is empty for docs without frontmatter.title.

---

## Code Examples

### Verified: Memory FTS with Importance Boosting
```typescript
// Source: src/db/repositories/memory/MemoryRepository.ts (VERIFIED)
// ts_rank_cd with project+global scope filter
const rankSql = "ts_rank_cd(to_tsvector('english', m.body), plainto_tsquery('english', ?))";
const qb = this.createQueryBuilder("m")
  .select(["m.id", raw(`${rankSql} as text_rank`, [query])])
  .where({ org: opts.orgId })
  .andWhere("to_tsvector('english', m.body) @@ plainto_tsquery('english', ?)", [query])
  .orderBy([{ [raw(rankSql, [query])]: "DESC" }, { createdAt: "DESC" }])
  .limit(candidateLimit(opts));
```

### Verified: Hybrid Scoring (needs weight update)
```typescript
// Source: src/memory/retrieval/hybrid-scoring.ts (VERIFIED — current weights WRONG)
// Current: BM25_WEIGHT = 0.6, COSINE_WEIGHT = 0.4
// Required by D-26: BM25_WEIGHT = 0.3, COSINE_WEIGHT = 0.7
const BM25_WEIGHT = 0.3;  // UPDATE from 0.6
const COSINE_WEIGHT = 0.7; // UPDATE from 0.4
```

### Verified: Orama Search Query Pattern
```typescript
// Source: [VERIFIED: @orama/orama 3.1.18]
import { search } from "@orama/orama";
const results = await search(db, {
  term: "authentication middleware",
  properties: ["title", "body"],
  facets: { kind: {}, status: {} },
  where: { kind: { eq: "task" } },
  limit: 20,
  boost: { title: 2 },
});
// results.hits — array of SearchResult
// results.facets — { kind: { count: { task: 42, doc: 17 } } }
```

### Verified: GIN Index on tsvector Expression (PGlite-safe)
```typescript
// Source: src/db/entities/memory/Memory.ts (VERIFIED — confirmed working pattern)
@Index({
  name: "search_documents_tsv",
  expression: `CREATE INDEX "search_documents_tsv" ON "search_documents" USING GIN (to_tsvector('english', title || ' ' || body))`,
})
// Use expression index, NOT generated column — PGlite compatible
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom FTS with raw SQL | PGlite tsvector + Orama dual layer | Phase 6 | Client-side facets, server-side authoritative results |
| Full-snapshot versioning only | ProseMirror Step JSON + periodic snapshots | Phase 6 | Incremental deltas, inline diff view |
| 0.6 BM25 + 0.4 cosine hybrid | 0.3 FTS + 0.7 cosine (D-26) | Phase 6 | More semantically driven results when embeddings enabled |
| Stub tRPC routers (documents, memories, search, doc-versions, doc-comments) | Real implementations | Phase 6 | All 5 routers become functional |

**Deprecated patterns to fix this phase:**
- `ensureSavedSearchColumns()` DDL in request handler — replace with migration.
- `ProductDb.query()` in `saved-searches.ts` — replace with MikroORM repository.
- `docVersionsRouter`, `docCommentsRouter`, `documentsRouter`, `memoriesRouter` stub routers — all `listProcedure()` / `mutationProcedure()` stubs return `[]` or `{ok: true}`; must replace with real service calls.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ContextBundleService does not exist — no implementation found in src/memory/ | Standard Stack, Don't Hand-Roll | Low — grep confirmed no file; context-snapshot.ts exists (different thing) |
| A2 | context_summary JSONB column does not yet exist on documents table | Phase Requirements DOC-09 | Low — grep found no references to `context_summary` in any source file |
| A3 | Document entity has no `title` column — title derived from frontmatter or bodyMd first line | Pitfall 7 | Medium — if title column exists in DB but not in MikroORM entity, indexer may still work but entity is wrong |
| A4 | Token budget of 8000 for ContextBundleService | Code Examples | Medium — actual budget depends on tenant settings; D-25 says "under token budget" but doesn't specify total |
| A5 | TipTap starter-kit schema is stable across 3.x minor versions for step replay purposes | Pitfall 3 | Medium — if schema changes between minor versions, old steps cannot replay; test with real doc roundtrip |

---

## Open Questions

1. **Document.title column**
   - What we know: `Document` entity has no `title` property in the MikroORM entity definition
   - What's unclear: Does the `documents` table have a `title` column added by a prior migration? The search indexer fetches `title` from a SQL query — how?
   - Recommendation: Check `DocumentIndexer.buildDocument()` SQL query — it selects `title`. Verify the DB column exists; if missing, add in Phase 6 migration.

2. **Saved searches migration scope**
   - What we know: `saved-searches.ts` uses raw SQL + DDL. Must be replaced.
   - What's unclear: Does a `SavedSearch` MikroORM entity exist? The `saved_searches` table exists (referenced in SQL) but no entity file was found.
   - Recommendation: Create `SavedSearch` MikroORM entity + migration in Wave 0.

3. **ContextBundleService token counting library**
   - What we know: D-25 says "token counting via tiktoken-equivalent". No token counting utility found in codebase.
   - What's unclear: Use `tiktoken` npm package, `gpt-tokenizer`, or chars/4 approximation?
   - Recommendation: Verify no existing token counter in codebase; if absent, use `gpt-tokenizer` (pure JS, no WASM) for `cl100k_base` encoding.

4. **Mermaid SSR compatibility**
   - What we know: Mermaid 11.x requires DOM; SvelteKit can SSR TipTap pages.
   - What's unclear: Does the doc editor page disable SSR? Mermaid must not run during SSR.
   - Recommendation: Wrap Mermaid NodeView in `browser` guard (`import { browser } from '$app/environment'`).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| bun | Build + test runner | ✓ | (project uses bun) | — |
| PGlite | DB layer | ✓ | (already running) | — |
| fastembed sidecar (Phase 4) | MEM-05 hybrid scoring | ✓ | (Phase 4 complete) | Disable embeddings flag |
| `@tiptap/extension-mathematics` | DOC-03 KaTeX | ✗ | — | Install in Wave 0 |
| `mermaid` | DOC-04 | ✗ | — | Install in Wave 0 |
| `prosemirror-changeset` | DOC-06 diff view | ✗ | — | Install in Wave 0 |
| `@orama/orama` | SRC-04 | ✗ | — | Install in Wave 0 |
| `@orama/plugin-data-persistence` | SRC-04 hydration | ✗ | — | Install in Wave 0 |

**Missing dependencies with no fallback:** All 5 packages above must be installed in Wave 0 before any implementation tasks.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun test (built-in) |
| Config file | none — bun test discovers `*.test.ts` files |
| Quick run command | `bun test src/docs/ src/memory/ src/search/` |
| Full suite command | `bun run ci` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOC-01 | TipTap contentJson round-trips losslessly | integration | `bun test src/docs/ --testNamePattern "round.trip"` | ❌ Wave 0 |
| DOC-03 | KaTeX renders in editor | component | `bun test src/web/src/lib/docs/` | ❌ Wave 0 |
| DOC-04 | Mermaid renders in NodeView | component | `bun test src/web/src/lib/docs/` | ❌ Wave 0 |
| DOC-06 | applyDelta() handles ProseMirror steps | unit | `bun test src/docs/version-reconstructor.test.ts` | ❌ Wave 0 |
| DOC-07 | Wikilink creates doc_links row | integration | `bun test src/docs/ --testNamePattern "wikilink"` | ❌ Wave 0 |
| DOC-09 | context_summary extracted on save | unit | `bun test src/docs/context-summary-extractor.test.ts` | ❌ Wave 0 |
| DOC-11 | doc_comments CRUD + threading | integration | `bun test src/trpc/routers/doc-comments.test.ts` | ❌ Wave 0 |
| MEM-01 | No vector(1536) references remain | unit/grep | `bun test src/memory/ --testNamePattern "dimension"` | ❌ Wave 0 |
| MEM-03 | FTS ranks project above global | unit | `bun test src/db/repositories/memory/ --testNamePattern "rank"` | ❌ Wave 0 |
| MEM-04 | Context bundle 5 slices under budget | unit | `bun test src/memory/context-bundle-service.test.ts` | ❌ Wave 0 |
| MEM-05 | Hybrid scoring uses 0.3/0.7 weights | unit | `bun test src/memory/retrieval/hybrid-scoring.test.ts` | check existing |
| MEM-06 | Memory promotion sets global=true | integration | `bun test src/trpc/routers/memories.test.ts --testNamePattern "promote"` | ❌ Wave 0 |
| SRC-01 | SearchDocument has all 13 columns | migration | `bun test src/db/migrations/ --testNamePattern "search"` | ❌ Wave 0 |
| SRC-02 | search.query tRPC returns ranked results | integration | `bun test src/trpc/routers/search.test.ts` | ❌ Wave 0 |
| SRC-04 | Orama query <100ms at 10k items | benchmark | `bun test src/search/orama-bench.test.ts` | ❌ Wave 0 |
| SRC-07 | Cmd+K opens on Cmd+K, 15+ commands | component | `bun test src/web/src/lib/components/command-palette/ --testNamePattern "navigation"` | check existing |

### Sampling Rate
- **Per task commit:** `bun test src/docs/ src/memory/ src/search/`
- **Per wave merge:** `bun run ci`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/docs/version-reconstructor.test.ts` — covers DOC-06 step replay
- [ ] `src/docs/context-summary-extractor.test.ts` — covers DOC-09
- [ ] `src/memory/context-bundle-service.test.ts` — covers MEM-04
- [ ] `src/trpc/routers/doc-comments.test.ts` — covers DOC-11
- [ ] `src/trpc/routers/memories.test.ts` — covers MEM-06/07
- [ ] `src/trpc/routers/search.test.ts` — covers SRC-02
- [ ] `src/search/orama-bench.test.ts` — covers SRC-04 benchmark
- [ ] Install: `cd src/web && bun add @tiptap/extension-mathematics mermaid prosemirror-changeset @orama/orama @orama/plugin-data-persistence`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod schemas on all tRPC inputs; DOMPurify on doc HTML render |
| V4 Access Control | yes | `assertPermission()` on all new tRPC procedures (ARCH-02 lint rule enforced) |
| V2 Authentication | no | Auth already in place from Phase 1 |
| V3 Session Management | no | Sessions in place |
| V6 Cryptography | no | No new secrets in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via doc HTML (Mermaid SVG output) | Tampering | DOMPurify on all rendered HTML; `sanitize.ts` already exists |
| SQL injection via search term | Tampering | `plainto_tsquery()` (parameterized) — safe; Orama is in-browser, no SQL |
| Path traversal in wikilinks | Tampering | Validate wikilink targets are existing doc UUIDs before creating DocLink row |
| IDOR on doc_comments (access another org's comments) | Information Disclosure | org_id scoping on all queries; `assertPermission()` on tRPC |
| Saved search query injection | Tampering | Store serialized query JSON; never eval; validate schema on load |

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection — `src/db/entities/`, `src/docs/`, `src/memory/`, `src/search/`, `src/trpc/routers/`, `src/web/src/lib/components/command-palette/`
- npm registry — `npm view` for @orama/orama (3.1.18), prosemirror-changeset (2.4.1), @tiptap/extension-mathematics (3.22.5), mermaid (11.14.0), @orama/plugin-data-persistence (3.1.18), katex (0.16.45)

### Secondary (MEDIUM confidence)
- CONTEXT.md D-01..D-31 — all decisions locked by user
- REQUIREMENTS.md DOC-01..12, MEM-01..09, SRC-01..09

### Tertiary (LOW confidence)
- [ASSUMED] ContextBundleService token budget of 8000 — not specified in requirements
- [ASSUMED] `gpt-tokenizer` recommendation for token counting — no library specified in decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry
- Architecture: HIGH — all entities, routers, and screen files verified by direct inspection
- Pitfalls: HIGH — concrete code locations cited for all pitfalls
- ContextBundleService design: MEDIUM — no existing implementation to verify against

**Research date:** 2026-05-05
**Valid until:** 2026-06-04 (stable libraries; 30-day horizon)
