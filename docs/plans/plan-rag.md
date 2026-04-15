# Plan: RAG / Embeddings / Code Search

**Gaps addressed**: GAP-RAG-1 through GAP-RAG-8  
**Priority order**: Trivial fixes first, then wiring, then structural  
**Files**: `packages/memory/src/recall.ts`, `packages/memory/src/ingest.ts`, `packages/memory/src/kuzu/query.ts`, `packages/core/src/embedding/`

---

## Step 1 — Trivial: Fix asymmetric embedding in recall path (GAP-RAG-2)

In `packages/memory/src/recall.ts`:

Line 155 (L2 path):
```typescript
// Before:
const queryVec = await embedder.embed(input.query)
// After:
const queryVec = await embedder.embedQuery 
  ? await embedder.embedQuery(input.query)
  : await embedder.embed(input.query)
```

Line 212 (L1 vector path):
```typescript
// Before:
const queryVec = await embedder.embed(input.query)
// After:
const queryVec = await (embedder.embedQuery ?? embedder.embed.bind(embedder))(input.query)
```

Both changes are two-liners. This is the single highest-ROI fix in the RAG domain — it directly affects retrieval quality for every embed-enabled install.

---

## Step 2 — Trivial: Fix reranker sigmoid (GAP-RAG-6)

In `packages/memory/src/recall.ts:278-280`:

```typescript
// Before:
score: typeof rs === 'number' && Number.isFinite(rs)
  ? Math.max(0, Math.min(1, rs))  // clamp logits to [0,1]
  : s.score,

// After:
score: typeof rs === 'number' && Number.isFinite(rs)
  ? 1 / (1 + Math.exp(-rs))  // sigmoid: maps any logit to (0,1) preserving rank order
  : s.score,
```

One line change. Fixes collapsed rank ordering for high-confidence reranker results.

---

## Step 3 — Low: Wire ASTChunker into ingest.ts (GAP-RAG-1)

In `packages/memory/src/ingest.ts`, replace the `chunkSyntax()` call with the `ASTChunker`:

```typescript
import { createASTChunker } from './chunkers/ast-chunker.js'

// In ingestFile():
let rawChunks: ChunkResult[]
if (isSyntax) {
  const chunker = createASTChunker(lang as SupportedLanguage)
  if (chunker) {
    rawChunks = await chunker.chunk(content, { filePath: file_path })
  } else {
    // WASM not available — fall back to regex
    rawChunks = chunkSyntax(content)
  }
} else {
  rawChunks = chunkSemantic(content)
}
```

This wires existing, tested code. No new logic. Also extend `SUPPORTED_LANGUAGES` in `ast-chunker.ts` to cover Python and Go by loading their tree-sitter grammars from `@ts-morph/grammars` or equivalent.

---

## Step 4 — Low: Add code-aware FTS5 tokenizer (GAP-RAG-3)

Create `packages/core/src/db/migrations/m043.ts` — drop and recreate `memories_fts` with a better tokenizer:

```typescript
export function runM043(db: Database.Database): void {
  // Note: FTS5 tables cannot be altered; must recreate
  db.exec(`
    DROP TABLE IF EXISTS memories_fts;
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      title, summary, content,
      content='memories', content_rowid='rowid',
      tokenize='porter unicode61'
    );
    -- Repopulate from existing memories
    INSERT INTO memories_fts(rowid, title, summary, content)
      SELECT rowid, title, summary, content FROM memories;
  `)
}
```

Note: `porter unicode61` is the pragmatic choice — it handles stemming and Unicode well. Full camelCase splitting requires a custom SQLite tokenizer UDF (higher effort, defer to a future migration).

---

## Step 5 — Medium: Import graph edges during code ingest (GAP-RAG-4)

In `packages/memory/src/ingest.ts`, after creating memories for code chunks, emit `USES` edges in Kuzu for import declarations:

```typescript
// Parse import declarations from TypeScript/JavaScript files
function extractImports(content: string, language: string): string[] {
  if (!['typescript', 'javascript'].includes(language)) return []
  const imports: string[] = []
  const importRe = /^(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/gm
  for (const match of content.matchAll(importRe)) {
    imports.push(match[1])
  }
  return imports
}

// After writing memories for a file, emit USES edges
if (kuzuClient?.isReady && isSyntax) {
  const imports = extractImports(content, lang ?? '')
  for (const importPath of imports) {
    await upsertEdge(kuzuClient, {
      from: file_path,
      to: importPath,
      type: 'USES',
      workspace_id,
    })
  }
}
```

This is lightweight static analysis — no AST required for import parsing.

---

## Step 6 — Low: MMR with actual cosine similarity (GAP-RAG-5)

In `packages/memory/src/kuzu/query.ts`, the `mmrDiversify()` function currently degrades to score ordering. The fix requires passing candidate embeddings from the Kuzu query results:

```typescript
// In queryMemoriesL2, retrieve embedding vectors alongside scores
// Then in mmrDiversify, compute cosine similarity:
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}
```

---

## Step 7 — Minor: Memory paging (GAP-RAG-8)

Add `offset?: number` parameter to `recallMemory()` and to the `recall_memory` MCP tool schema. Pass it to the SQL LIMIT/OFFSET clause. This enables agent-driven pagination without MemGPT-style full paging infrastructure.

---

## Step 8 — Future: Embedding registry extensibility (from GAP-ARCH-6)

See plan-architecture.md. This plan only addresses the recall/ingest bugs; registry extensibility is an architecture concern handled there.

---

## Acceptance Criteria

- [ ] `recall.ts` uses `embedQuery()` for all query-time embedding calls (both L1 and L2 paths)
- [ ] Reranker uses sigmoid, not linear clamp
- [ ] `ingest.ts` calls `createASTChunker()` first, falls back to regex on WASM failure
- [ ] Migration m043 recreates `memories_fts` with `porter unicode61` tokenizer
- [ ] Import declarations extracted during TypeScript file ingest and stored as Kuzu `USES` edges
- [ ] All existing memory tests pass
- [ ] New test: ingest a TypeScript file with imports and verify `USES` edges in Kuzu
