# Phase 6: Documents + Memory + Search — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 22 new/modified files
**Analogs found:** 20 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/docs/version-reconstructor.ts` | service | transform | `src/docs/version-reconstructor.ts` (self — fix) | exact |
| `src/docs/context-summary-extractor.ts` | service | transform | `src/search/indexers/document.ts` | role-match |
| `src/memory/context-bundle-service.ts` | service | batch | `src/memory/retrieval/hybrid-scoring.ts` | role-match |
| `src/memory/retrieval/hybrid-scoring.ts` | service | transform | self (weight update only) | exact |
| `src/search/query-service.ts` | service | request-response | `src/search/indexers/base.ts` | role-match |
| `src/db/entities/search/SearchDocument.ts` | model | CRUD | `src/db/entities/memory/Memory.ts` | exact |
| `src/db/migrations/Migration206XXX.ts` | migration | batch | existing migrations pattern | role-match |
| `src/trpc/routers/documents.ts` | controller | CRUD | `src/trpc/routers/artifacts.ts` | exact |
| `src/trpc/routers/memories.ts` | controller | CRUD | `src/trpc/routers/artifacts.ts` | exact |
| `src/trpc/routers/search.ts` | controller | request-response | `src/trpc/routers/search.ts` (self — replace stub) | exact |
| `src/trpc/routers/doc-versions.ts` | controller | request-response | `src/trpc/routers/runs.ts` | role-match |
| `src/trpc/routers/doc-comments.ts` | controller | CRUD | `src/trpc/routers/artifacts.ts` | exact |
| `src/search/indexers/document.ts` | service | CRUD | `src/search/indexers/document.ts` (self — expand) | exact |
| `src/web/src/lib/search/OramaIndex.ts` | service | request-response | `src/web/src/lib/memory/memory-browser.ts` | role-match |
| `src/web/src/lib/components/command-palette/navigation-commands.ts` | utility | event-driven | `src/web/src/lib/components/command-palette/command-palette-filter.ts` | exact |
| `src/web/src/lib/docs/TiptapEditor.svelte` | component | event-driven | `src/web/src/lib/components/CommandPalette.svelte` | role-match |
| `src/web/src/lib/docs/DocVersionTimeline.svelte` | component | request-response | `src/web/src/lib/components/CommandPalette.svelte` | role-match |
| `src/web/src/lib/docs/DocCommentPanel.svelte` | component | event-driven | no analog | none |
| `src/web/src/lib/docs/DocsSidebar.svelte` | component | event-driven | no analog | none |
| `src/tui/screens/search-screen.ts` | controller | request-response | self (self — wire) | exact |
| `src/tui/screens/memory-browser.ts` | controller | CRUD | `src/tui/screens/search-screen.ts` | role-match |
| `src/cli/commands/docs.ts` | utility | CRUD | self (self — extend) | exact |

---

## Pattern Assignments

### `src/docs/version-reconstructor.ts` (service, transform — FIX)

**Analog:** self (`src/docs/version-reconstructor.ts` lines 26-33)

**Current broken pattern** (lines 26-33 — throws on incremental steps):
```typescript
function applyDelta(base: Record<string, unknown>, delta: Record<string, unknown> | null): Record<string, unknown> {
  const ops = (delta as StoredDelta | null)?.ops;
  const first = ops?.[0];
  if (first && Array.isArray(first.path) && first.path.length === 0 && first.value && typeof first.value === "object") {
    return jsonClone(first.value as Record<string, unknown>);
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unsupported document version delta." });
}
```

**New pattern to replace with** (D-01/D-02):
```typescript
import { Node, Schema } from "@tiptap/pm/model";
import { Transform, Step } from "@tiptap/pm/transform";

function applyDelta(
  base: Record<string, unknown>,
  delta: Record<string, unknown> | null,
  schema: Schema,
): Record<string, unknown> {
  const ops = (delta as StoredDelta | null)?.ops;
  const first = ops?.[0];
  // Legacy full-snapshot op (path=[]) — keep working
  if (first && Array.isArray(first.path) && first.path.length === 0 && first.value && typeof first.value === "object") {
    return jsonClone(first.value as Record<string, unknown>);
  }
  // New: ProseMirror Step JSON array in delta.steps[]
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

**diffDocVersionsHtml replacement** (lines 79-97 — replace JSON stringify diff with prosemirror-changeset):
```typescript
import { simplifyChanges, computeChange } from "prosemirror-changeset";
// compute structural diff between two ProseMirror docs
// returns HTML string with <ins>/<del> spans for version timeline UI
```

---

### `src/docs/context-summary-extractor.ts` (service, transform — NEW)

**Analog:** `src/search/indexers/document.ts` — `stripDocumentMarkdown()` + `buildDocument()` pattern

**Imports pattern** (copy from `src/search/indexers/document.ts` lines 1-5):
```typescript
import { injectable as Injectable } from "@needle-di/core";
import type { ProductDb } from "../../product-kernel/db/types.ts";
```

**Core extraction pattern** (modeled on `document.ts` lines 44-73):
```typescript
// NEW file — no existing implementation
// Extract from bodyMd on save: headings tree, wikilink targets, @mentions
@Injectable()
export class ContextSummaryExtractor {
  extractSummary(bodyMd: string): ContextSummary {
    const headings = extractHeadings(bodyMd);         // regex: /^#{1,6}\s+(.+)/gm
    const wikilinks = extractWikilinks(bodyMd);       // reuse src/docs/wikilink-extractor.ts
    const mentions = extractMentions(bodyMd);         // regex: /@([a-zA-Z0-9_-]+)/g
    return { headings, wikilinks, mentions };
  }
}
```

**Existing wikilink extractor to reuse:** `src/docs/wikilink-extractor.ts`

---

### `src/memory/context-bundle-service.ts` (service, batch — NEW)

**Analog:** `src/memory/retrieval/hybrid-scoring.ts` (same service layer, composable pattern)

**Imports pattern** (from `hybrid-scoring.ts` lines 1+ and `memory-browser.ts` line 1):
```typescript
import type { MemoryRow, MemoryConfig } from "../../web/src/lib/memory/memory-browser.ts";
// + repository imports via needle-di injection
```

**Core slice-assembly pattern** (D-25):
```typescript
const TOTAL_TOKEN_BUDGET = 8000;
const SLICE_BUDGETS = {
  memories:     0.25,
  linkedDocs:   0.20,
  recentRuns:   0.35,
  repoState:    0.10,   // returns [] until Phase 7
  skillPrompts: 0.10,
} as const;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // chars/4 approximation; replace with gpt-tokenizer later
}

@Injectable()
export class ContextBundleService {
  async assemble(ctx: BundleContext): Promise<ContextBundle> {
    const slices: Record<string, unknown[]> = {};
    for (const [name, fraction] of Object.entries(SLICE_BUDGETS)) {
      const sliceBudget = Math.floor(TOTAL_TOKEN_BUDGET * fraction);
      slices[name] = await this.fillSlice(name, ctx, sliceBudget);
    }
    return slices as ContextBundle;
  }

  private async fillSlice(name: string, ctx: BundleContext, budget: number): Promise<unknown[]> {
    // each slice calls its own retriever; greedy fill stops when estimateTokens() > budget
  }
}
```

---

### `src/memory/retrieval/hybrid-scoring.ts` (service, transform — UPDATE weights only)

**Analog:** self (`src/memory/retrieval/hybrid-scoring.ts` lines 11-12)

**Change:** Two constant updates only:
```typescript
// BEFORE (lines 11-12):
const BM25_WEIGHT = 0.6;
const COSINE_WEIGHT = 0.4;

// AFTER (D-26):
const BM25_WEIGHT = 0.3;
const COSINE_WEIGHT = 0.7;
```

Note: existing `hybridScore()` function signature unchanged; only constants change. Update test expected values accordingly.

---

### `src/search/query-service.ts` (service, request-response — NEW)

**Analog:** `src/search/indexers/base.ts` — `SearchIndexHook` class (same `ProductDb` + `@Injectable()` pattern)

**Imports pattern** (from `base.ts` lines 1-13):
```typescript
import { injectable as Injectable } from "@needle-di/core";
import type { ProductDb } from "../../product-kernel/db/types.ts";
```

**Core PGlite FTS query pattern** (extends `MemoryRepository.searchProjectAndGlobal()` approach from RESEARCH.md):
```typescript
@Injectable()
export class SearchQueryService {
  constructor(private readonly db: ProductDb) {}

  async query(input: SearchQueryInput): Promise<SearchQueryOutput> {
    const { term, filters, limit = 20, offset = 0 } = input;
    // GIN index on to_tsvector(title || ' ' || body) — see SearchDocument expansion
    const rows = await this.db.query<SearchDocRow>(
      `SELECT id, org_id, entity_kind, entity_id, title, body,
              labels, metadata, updated_at, project_id, status,
              ts_rank(to_tsvector('english', title || ' ' || body),
                      plainto_tsquery('english', $2)) AS rank
         FROM search_documents
        WHERE org_id = $1
          AND to_tsvector('english', title || ' ' || body)
              @@ plainto_tsquery('english', $2)
          ${filters?.kinds?.length ? `AND entity_kind = ANY($3)` : ""}
        ORDER BY rank DESC
        LIMIT $${filters?.kinds?.length ? 4 : 3}
       OFFSET $${filters?.kinds?.length ? 5 : 4}`,
      buildQueryParams(input),
    );
    return { results: rows, total: rows.length };
  }
}
```

---

### `src/db/entities/search/SearchDocument.ts` (model, CRUD — EXPAND)

**Analog:** `src/db/entities/memory/Memory.ts` — MikroORM v7 ES Stage-3 decorator pattern

**Existing stub** (`src/db/entities/search/SearchDocument.ts` lines 27-54) — has `id`, `org`, `entityKind`, `entityId`, `embedding`. Add these properties following Memory.ts decorator style:

```typescript
// Add after entityId (line 50), before embedding (line 52):
@Property({ type: "string", nullable: true, fieldName: "title" })
title?: string;

@Property({ type: "text", nullable: true, fieldName: "body" })
body?: string;

@Property({ type: "array", nullable: true, fieldName: "labels" })
labels?: string[];

@Property({ type: "json", nullable: true, fieldName: "metadata" })
metadata?: Record<string, unknown>;

@Property({ nullable: true, fieldName: "updated_at" })
updatedAt?: Date;

@Property({ type: "string", nullable: true, fieldName: "project_id" })
projectId?: string | null;

@Property({ type: "string", nullable: true, fieldName: "status" })
status?: string | null;

// GIN index (PGlite-safe expression index, NOT generated column — see Memory.ts line 46-48):
@Index({
  name: "search_documents_tsv",
  expression: `CREATE INDEX "search_documents_tsv" ON "search_documents" USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')))`,
})
```

**Add conflict-safe UPSERT pattern** (from `base.ts` lines 83-107):
```typescript
ON CONFLICT (org_id, entity_kind, entity_id) DO UPDATE
   SET title = EXCLUDED.title,
       body = EXCLUDED.body,
       ...
       updated_at = now()
```

---

### `src/trpc/routers/documents.ts` (controller, CRUD — REPLACE STUB)

**Analog:** `src/trpc/routers/artifacts.ts` — full CRUD pattern with `deps(ctx)`, `findRecord()`, org-id guard, Zod schemas

**Imports pattern** (from `artifacts.ts` lines 1-18):
```typescript
import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../context.ts";
import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { ... } from "../schemas/documents.ts";  // create parallel to schemas/artifacts.ts
```

**deps() pattern** (from `artifacts.ts` lines 79-86) — copy exactly, substituting `documents`:
```typescript
function deps(ctx: TRPCContext) {
  const docsCtx = (ctx as DocsDepsContext).documents;
  return {
    repository: docsCtx?.repository ?? {},
  };
}
```

**permissionedProcedure pattern** (from `artifacts.ts` lines 167-169):
```typescript
list: permissionedProcedure({ resource: "documents", action: "list" })
  .input(ListDocsInputSchema)
  .output(DocSchema.array())
  .query(async ({ ctx, input }) => { ... }),
```

**NOT_FOUND + org-id guard pattern** (from `artifacts.ts` lines 133-148):
```typescript
async function findDoc(ctx: TRPCContext, id: string): Promise<DocRecord> {
  const record = await deps(ctx).repository.getById?.({ id });
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: `Document not found: ${id}` });
  if (record.orgId !== ctx.orgId) throw new TRPCError({ code: "FORBIDDEN", message: "Document belongs to a different org." });
  return record;
}
```

---

### `src/trpc/routers/memories.ts` (controller, CRUD — REPLACE STUB)

**Analog:** `src/trpc/routers/artifacts.ts` — same full CRUD + `deps(ctx)` pattern

**Additional procedure (promote)** — beyond standard CRUD:
```typescript
promote: permissionedProcedure({ resource: "memories", action: "promote" })
  .input(z.object({ id: z.string() }))
  .output(MemorySchema)
  .mutation(async ({ ctx, input }) => {
    const record = await findMemory(ctx, input.id);
    const updated = await deps(ctx).repository.update?.({
      id: input.id,
      data: { global: true },  // preserves projectId for audit trail per D-27
    });
    return toMemory(updated ?? { ...record, global: true });
  }),
```

**search procedure** — FTS via MemoryRepository:
```typescript
search: permissionedProcedure({ resource: "memories", action: "search" })
  .input(z.object({ q: z.string(), projectId: z.string().optional() }))
  .output(MemorySchema.array())
  .query(async ({ ctx, input }) => {
    // delegate to MemoryRepository.searchProjectAndGlobal() — existing impl per RESEARCH.md
  }),
```

---

### `src/trpc/routers/search.ts` (controller, request-response — REPLACE query/suggest stubs)

**Analog:** self (lines 25-98) — saved* and recordClick procedures are real; only `query` and `suggest` are stubs

**Replace query stub** (lines 27-30) with real SearchQueryService call:
```typescript
query: permissionedProcedure({ resource: "search", action: "query" })
  .input(SearchQueryInputSchema)           // expand from { q: string } to D-14 full shape
  .output(SearchQueryOutputSchema)
  .query(async ({ ctx, input }) => {
    const svc = ctx.container?.get(SearchQueryService);
    if (!svc) return { results: [], total: 0 };
    return svc.query({ ...input, orgId: ctx.orgId });
  }),
```

**Keep existing saved* + recordClick procedures unchanged** (lines 38-98).

---

### `src/trpc/routers/doc-versions.ts` (controller, request-response — REPLACE STUB)

**Analog:** `src/trpc/routers/runs.ts` — paginated read-only query pattern (lines 22-48)

```typescript
import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { reconstructDocVersion } from "../../docs/version-reconstructor.ts";

export const docVersionsRouter = t.router({
  list: permissionedProcedure({ resource: "docVersions", action: "list" })
    .input(z.object({ docId: z.string(), limit: z.number().int().min(1).max(100).optional() }))
    .output(DocVersionSchema.array())
    .query(async ({ ctx, input }) => { /* em.find DocVersion rows */ }),

  restore: permissionedProcedure({ resource: "docVersions", action: "restore" })
    .input(z.object({ docId: z.string(), versionNum: z.number().int() }))
    .output(DocSchema)
    .mutation(async ({ ctx, input }) => {
      const { contentJson } = await reconstructDocVersion(ctx.em, { orgId: ctx.orgId, ...input });
      // write new DocVersion snapshot + update Document.contentJson
    }),
});
```

---

### `src/trpc/routers/doc-comments.ts` (controller, CRUD — REPLACE STUB)

**Analog:** `src/trpc/routers/artifacts.ts` — CRUD with org-id guard

**Key extra fields** vs artifacts (anchor re-mapping on version restore):
```typescript
create: permissionedProcedure({ resource: "docComments", action: "create" })
  .input(z.object({
    docId: z.string(),
    body: z.string().min(1),
    anchorRange: z.record(z.unknown()).optional(),  // JSON anchor from TipTap selection
    parentCommentId: z.string().optional(),
  }))
  .output(DocCommentSchema)
  .mutation(async ({ ctx, input }) => { ... }),

resolve: permissionedProcedure({ resource: "docComments", action: "resolve" })
  .input(z.object({ id: z.string() }))
  .output(z.object({ ok: z.literal(true) }))
  .mutation(async ({ ctx, input }) => { /* set resolved=true */ }),
```

---

### `src/search/indexers/document.ts` (service, CRUD — EXPAND write path)

**Analog:** self (lines 36-83) — `buildDocument()` already extracts title/body/labels/metadata

**Add `status` field to returned `SearchDocumentInput`** (base.ts upsert already handles it if `SearchDocumentInput` is extended):
```typescript
// In buildDocument() return (after line 73):
return {
  orgId: doc.org_id,
  projectId: doc.project_id,
  sourceKind: this.kind,
  sourceId: doc.id,
  title: doc.title,
  body: stripDocumentMarkdown(...),
  labels: tagsFromUnknown(doc.frontmatter?.["tags"]),
  metadata: { doc_type: doc.doc_type ?? doc.kind ?? null, scope: doc.scope ?? "project" },
  status: doc.status ?? null,        // ADD — new expanded column
  updatedAt: doc.updated_at ?? null, // ADD
};
```

**Other 6 indexers** (task, memory, run, artifact, repo, sprint) follow the same self-extension pattern.

---

### `src/web/src/lib/search/OramaIndex.ts` (service, request-response — NEW)

**Analog:** `src/web/src/lib/memory/memory-browser.ts` — typed interface + pure functions pattern (no class state for logic, class only for index lifecycle)

**Imports pattern:**
```typescript
import { create, insert, search } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
```

**Schema definition** (D-16 — mirrors SearchDocument expanded columns):
```typescript
const ORAMA_SCHEMA = {
  title:     "string",
  body:      "string",
  kind:      "enum",
  projectId: "string",
  status:    "string",
  updatedAt: "number",
  entityId:  "string",
} as const;
```

**Null sentinel pattern** (Pitfall 2 — Orama enum strict):
```typescript
// Before insert, normalize null enum fields:
kind:   row.kind   ?? "none",
status: row.status ?? "none",
```

**hydrate/query/serialize** — copy from RESEARCH.md Pattern 2 (`FulcrumOramaIndex` class).

---

### `src/web/src/lib/components/command-palette/navigation-commands.ts` (utility, event-driven — NEW)

**Analog:** `src/web/src/lib/components/command-palette/command-palette-filter.ts` — `CommandItem` interface (lines 1-7)

**Extend `CommandItem`** to add `category` and `action` fields:
```typescript
import type { CommandItem } from "./command-palette-filter";

// CommandItem already has: { id, label, href? }
// Extend for Phase 6 commands:
export interface ExtendedCommandItem extends CommandItem {
  category: "navigation" | "creation" | "bulk" | "search";
  action?: string;  // tRPC procedure path e.g. "tasks.create"
}
```

**Selection-context store** (Pitfall 4 — selection must live in Svelte store, not component):
```typescript
// src/web/src/lib/state/selection.ts (NEW store)
import { writable } from "svelte/store";
export const selectedTaskIds = writable<string[]>([]);
```

**makeKeydownHandler** (from `command-palette-handlers.ts` lines 9-24) — already handles Cmd+K; no change needed.

**CmdkPaletteCache** (from `cmdk-palette.ts` lines 30-50) — extend `query()` to accept Orama results alongside tRPC results.

---

### `src/web/src/lib/docs/TiptapEditor.svelte` (component, event-driven — NEW)

**Analog:** `src/web/src/lib/components/CommandPalette.svelte` — SvelteKit component with keyboard event + store pattern

**Key wiring** (D-05/D-06/D-07/D-08):
- `svelte-tiptap` `<Editor>` component (already installed)
- `@tiptap/extension-mathematics` for KaTeX
- Custom Mermaid NodeView wrapped in `browser` guard (Pitfall 4 of RESEARCH.md):
  ```typescript
  import { browser } from '$app/environment';
  // Only call mermaid.render() when browser === true
  ```
- toolbar preset map keyed by `docType`:
  ```typescript
  const TOOLBAR_PRESETS: Record<string, ToolbarConfig> = {
    spec:          { ... },
    adr:           { ... },
    wiki:          { ... },
    runbook:       { ... },
    meeting:       { ... },
    postmortem:    { ... },
    rfc:           { ... },
    note:          { ... },
    scratch:       { ... },
  };
  ```

---

### `src/tui/screens/search-screen.ts` (controller, request-response — WIRE)

**Analog:** self — existing `buildFilterChips()` / `toggleSemanticMode()` logic intact; add real `SearchService` implementation wired to tRPC `search.query`.

**Pattern to add** (mirroring `memory-browser.ts` `createDebouncedMemorySearch()` lines 85-94):
```typescript
export function createDebouncedSearch<TInput>(
  search: (input: TInput) => void,
  delayMs = 300,
): (input: TInput) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (input: TInput) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => search(input), delayMs);
  };
}
```

---

### `src/cli/commands/docs.ts` (utility, CRUD — EXTEND)

**Analog:** self (already fully implemented — lines 1-403)

**Add `memory` subcommand** as new CLI command `src/cli/commands/memory.ts` copying the exact `docs.ts` structure:
- HELP string with `fulcrum memory list|get|promote` usage
- `resolveCaller()` → dynamic import `../../trpc/trpc.ts` + `../../trpc/router.ts`
- `printOutput()` + `formatRows()` + `--json` flag pattern (lines 289-308)
- `withErrors()` try/catch pattern (lines 310-322)

**Add `search` subcommand** as `src/cli/commands/search.ts` — same skeleton, delegates to `search.query` tRPC procedure.

---

## Shared Patterns

### Auth / Permission Guard
**Source:** `src/trpc/middleware.ts` lines 206-208
**Apply to:** All new tRPC router procedures
```typescript
export function permissionedProcedure(input: { resource: string; action: string }) {
  return protectedProcedure.meta(permission(input.resource, input.action));
}
// Usage: permissionedProcedure({ resource: "documents", action: "list" })
```

### Org-ID Guard
**Source:** `src/trpc/routers/artifacts.ts` lines 133-148
**Apply to:** All `get`/`update`/`delete`/`restore` procedures in documents, memories, doc-versions, doc-comments
```typescript
if (orgIdOf(record) !== ctx.orgId) {
  throw new TRPCError({ code: "FORBIDDEN", message: "... belongs to a different org." });
}
```

### needle-di Injectable Service
**Source:** `src/search/indexers/base.ts` lines 51-58
**Apply to:** `ContextBundleService`, `SearchQueryService`, `ContextSummaryExtractor`
```typescript
import { injectable as Injectable } from "@needle-di/core";
@Injectable()
export class MyService {
  constructor(protected readonly db: ProductDb) {}
}
```

### ProductDb Raw SQL Query
**Source:** `src/search/indexers/base.ts` lines 83-107
**Apply to:** `SearchQueryService`, any service needing PGlite FTS (`plainto_tsquery`)
```typescript
await this.db.query<RowType>(
  `SELECT ... FROM ... WHERE org_id = $1 AND ... @@ plainto_tsquery('english', $2)`,
  [orgId, term],
);
```

### GIN Index (PGlite-safe)
**Source:** `src/db/entities/memory/Memory.ts` lines 46-48
**Apply to:** `SearchDocument` entity expansion — use expression index, NOT generated column
```typescript
@Index({
  name: "search_documents_tsv",
  expression: `CREATE INDEX "search_documents_tsv" ON "search_documents" USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')))`,
})
```

### CLI Command Structure
**Source:** `src/cli/commands/docs.ts` lines 69-127 (run switch), 289-322 (printOutput + withErrors)
**Apply to:** `src/cli/commands/memory.ts`, `src/cli/commands/search.ts`
- `run(argv, opts)` with switch on subcommand
- `resolveCaller()` via dynamic tRPC import
- `printOutput(value, argv, print, human)` — `--json` flag check
- `withErrors(command, opts, fn)` — TRPCError message extraction

### MikroORM v7 Entity Decorator
**Source:** `src/db/entities/memory/Memory.ts` lines 10-16, 23-48
**Apply to:** `SearchDocument` entity expansion
```typescript
import { Entity, PrimaryKey, Property, ManyToOne, Index } from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
// @Entity({ tableName: "...", repository: () => XRepository })
// @Index({ name: "...", properties: [...] })   -- for B-tree
// @Index({ name: "...", expression: "CREATE INDEX ... USING GIN ..." })  -- for FTS
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/web/src/lib/docs/DocCommentPanel.svelte` | component | event-driven | No anchored inline comment component exists in codebase |
| `src/web/src/lib/docs/DocsSidebar.svelte` | component | event-driven | No drag-drop tree sidebar exists yet; `svelte-dnd-action` is used in Kanban but no Svelte component analog readable |

For these two: use RESEARCH.md patterns (D-09, D-10) + `svelte-dnd-action` docs. Kanban board component may have drag-drop patterns worth reading before implementation.

---

## Anti-Patterns to Avoid (from RESEARCH.md)

- **DDL in request handlers:** `src/search/saved-searches.ts` `ensureSavedSearchColumns()` — remove entirely; columns go in migration
- **ProductDb.query() in saved-searches:** replace with MikroORM `SavedSearch` entity + repository
- **Orama enum null:** normalize `kind`/`status` to sentinel `"none"` before insert
- **Mermaid in SSR:** wrap all `mermaid.render()` calls in `if (browser)` guard
- **ProseMirror schema lock:** snapshot every 10th version (D-02); force snapshot on TipTap upgrade

---

## Metadata

**Analog search scope:** `src/trpc/routers/`, `src/search/indexers/`, `src/db/entities/`, `src/memory/`, `src/docs/`, `src/cli/commands/`, `src/web/src/lib/`, `src/tui/screens/`
**Files scanned:** ~25
**Pattern extraction date:** 2026-05-05
