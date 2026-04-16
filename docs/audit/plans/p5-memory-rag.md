# P5 — Memory + RAG Pipeline

> Implements all issues from [F5 — Memory + RAG Audit](../findings/f5-rag-memory.md).
> 15 issues. The memory layer itself is architecturally sound; the gaps are in
> the retrieval pipeline: missing tree-sitter chunking, no hybrid RRF fusion,
> disconnected Kuzu writes, and the `writeMemory`/`recallMemory` duplication.

---

## Goal

Consolidate the two `writeMemory`/`recallMemory` implementations. Fix Kuzu
memory-node creation in the write path. Build a retrieval eval harness before
changing retrieval logic. Implement RRF hybrid fusion. Add tree-sitter AST
chunking for code. Wire the reranker correctly.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F5-ISSUE-10 | Consolidate the two `writeMemory`/`recallMemory` implementations | CRITICAL | P0 |
| F5-ISSUE-11 | Kuzu memory-node creation in the write path | CRITICAL | P0 |
| F5-ISSUE-08 | Retrieval eval harness | CRITICAL | P0 |
| F5-ISSUE-03 | RRF hybrid fusion (replace ad-hoc weighted sum) | HIGH | P1 |
| F5-ISSUE-09 | Scope composition in recall (workspace + project + session) | HIGH | P1 |
| F5-ISSUE-05 | Verified reranker wiring | HIGH | P1 |
| F5-ISSUE-12 | Instruction prefixes + Matryoshka truncation | HIGH | P1 |
| F5-ISSUE-01 | Tree-sitter AST chunker for code | HIGH | P2 |
| F5-ISSUE-02 | Separate code embedder path | HIGH | P2 |
| F5-ISSUE-04 | Aider-style repo-map | MEDIUM | P2 |
| F5-ISSUE-06 | Consolidation + decay jobs | MEDIUM | P2 |
| F5-ISSUE-07 | Ingestion quality gates | MEDIUM | P2 |
| F5-ISSUE-13 | Single retrieval telemetry span | MEDIUM | P3 |
| F5-ISSUE-14 | Fix `recall_memory` MCP tool description | LOW | P3 |
| F5-ISSUE-15 | Reranker sigmoid + batching | LOW | P3 |

---

## Recommended execution order (from F5 audit)

1. **F5-ISSUE-10** — Consolidate first (foundation for all other fixes)
2. **F5-ISSUE-11** — Kuzu node creation
3. **F5-ISSUE-08** — Eval harness (measure before you change)
4. **F5-ISSUE-03** — RRF fusion (improves recall quality)
5. **F5-ISSUE-09**, **F5-ISSUE-05**, **F5-ISSUE-12** — scope, reranker, prefixes
6. **F5-ISSUE-01**, **F5-ISSUE-02**, **F5-ISSUE-04** — tree-sitter and repo-map
7. **F5-ISSUE-06**, **F5-ISSUE-07** — decay, consolidation, quality gates

---

## Task breakdown

### Task 5.1 — Consolidate `writeMemory` / `recallMemory` (F5-ISSUE-10) [CRITICAL]

**Current state:** Two copies of `writeMemory` and `recallMemory` exist:
- `packages/memory/src/write.ts` (canonical)
- `packages/core/src/memory.ts` (re-export or copy)

**Files:**
- Modify: `packages/core/src/memory.ts` — re-export from `@moabualruz/fulcrum-memory`
- Modify: any consumers of the core copy — point to `@moabualruz/fulcrum-memory`
- Delete: duplicate implementation in core

**Steps:**

- [ ] `grep -r "writeMemory\|recallMemory" packages/ --include="*.ts"` to find all callers

- [ ] Confirm which implementation is canonical (check `@moabualruz/fulcrum-memory/src/write.ts`
  for the one with FTS5 + vec + Kuzu logic)

- [ ] In `packages/core/src/memory.ts`, replace the implementation with:
  ```ts
  export { writeMemory, recallMemory } from '@moabualruz/fulcrum-memory';
  ```

- [ ] Run `pnpm test` — all callers should continue to work

- [ ] Commit: `refactor(memory): consolidate writeMemory/recallMemory to @moabualruz/fulcrum-memory`

---

### Task 5.2 — Kuzu memory-node creation in write path (F5-ISSUE-11) [CRITICAL]

**Files:**
- Modify: `packages/memory/src/write.ts`

**Current state:** `writeMemory` writes to SQLite (`memories` table) but does NOT
create a corresponding node in the Kuzu graph.

**Steps:**

- [ ] Read `packages/memory/src/write.ts` — find where it writes to SQLite

- [ ] After the SQLite insert, add Kuzu node creation:
  ```ts
  if (graph) {
    await graph.query(`
      CREATE (m:Memory {
        id: $id,
        content: $content,
        workspace_id: $workspace_id,
        project_id: $project_id,
        created_at: $created_at
      })
    `, { id: memory.id, content: memory.content, ... });

    // Create edge to workspace
    await graph.query(`
      MATCH (w:Workspace {id: $workspace_id}), (m:Memory {id: $id})
      CREATE (w)-[:HAS_MEMORY]->(m)
    `, { workspace_id: memory.workspace_id, id: memory.id });
  }
  ```

- [ ] Make Kuzu graph creation conditional on availability (not all deployments have Kuzu)

- [ ] Write test: assert that after `writeMemory`, the Kuzu graph has a `Memory` node

- [ ] Commit: `feat(memory): create Kuzu Memory node in writeMemory write path`

---

### Task 5.3 — Retrieval eval harness (F5-ISSUE-08) [CRITICAL]

**Files:**
- Create: `packages/memory/src/eval/harness.ts`
- Create: `packages/memory/src/eval/fixtures.ts`
- Create: `packages/memory/src/eval/metrics.ts`

**Steps:**

- [ ] Create a fixture set of 50 memory entries covering:
  - Code snippets (TS, Python)
  - Technical decisions
  - Task descriptions
  - Architecture notes
  - Bug reports

- [ ] Create 20+ query/expected-result pairs:
  ```ts
  interface EvalCase {
    query: string;
    expectedIds: string[];   // memory IDs that should appear in top-k
    minScore: number;        // minimum acceptable recall@k
  }
  ```

- [ ] Write `runEval(recallFn, cases): EvalReport` that computes:
  - `recall@5`: fraction of expected IDs in top-5 results
  - `mrr`: mean reciprocal rank
  - `ndcg@5`: normalized discounted cumulative gain

- [ ] Run eval in tests and assert recall@5 ≥ 0.7

- [ ] Commit: `test(memory): retrieval eval harness — 50 fixtures, 20+ cases`

---

### Task 5.4 — RRF hybrid fusion (F5-ISSUE-03) [HIGH]

**Files:**
- Modify: `packages/memory/src/recall.ts`

**Current state:** Ad-hoc weighted sum: `0.6 * fts_score + 0.4 * vec_score`.

**Target:** Reciprocal Rank Fusion (RRF):
```
rrf_score(d) = Σ 1 / (k + rank_i(d))
```
where `k = 60` (standard default), `rank_i` is the rank of document `d` in
retrieval list `i` (FTS5 and vec separately).

**Steps:**

- [ ] Add a helper `rrf(lists: RankedResult[][], k = 60): RankedResult[]`

- [ ] In `recallMemory`, run FTS5 and vec queries independently to get ranked lists,
  then fuse with RRF

- [ ] Run the eval harness (Task 5.3) before and after — assert recall@5 improves
  (or stays the same — document the result)

- [ ] Commit: `feat(memory): RRF hybrid fusion replacing weighted sum`

---

### Task 5.5 — Scope composition in recall (F5-ISSUE-09) [HIGH]

**Files:**
- Modify: `packages/memory/src/recall.ts`

**Current state:** `recallMemory` queries only `workspace_id + project_id`.
Missing: session-scoped, workspace-scoped, and cross-project recall.

**Steps:**

- [ ] Add `scope` parameter to `recallMemory`:
  ```ts
  type MemoryScope = 'session' | 'project' | 'workspace' | 'global';
  interface RecallOptions {
    scope?: MemoryScope;
    session_id?: string;
    workspace_id: string;
    project_id?: string;
  }
  ```

- [ ] Implement scope-specific queries:
  - `session`: add `session_id = ?` filter
  - `project`: existing behaviour
  - `workspace`: drop `project_id` filter
  - `global`: no workspace filter (cross-workspace search)

- [ ] Update `recall_memory` MCP tool to accept `scope` parameter

- [ ] Write test cases for each scope level

- [ ] Commit: `feat(memory): scope composition — session/project/workspace/global`

---

### Task 5.6 — Verified reranker wiring (F5-ISSUE-05) [HIGH]

**Files:**
- Modify: `packages/memory/src/reranker.ts`
- Modify: `packages/memory/src/recall.ts`

**Current state:** Reranker exists but its output scores are discarded in
the final recall result (scores hardcoded to `0.0` — see F1-ISSUE-33).

**Steps:**

- [ ] Trace the call path from `recallMemory` → FTS/vec → reranker → result:
  ```ts
  // In recall.ts, after RRF fusion (Task 5.4):
  const reranked = await reranker.rerank(query, fusedResults);
  return reranked.map(r => ({ ...r, score: r.rerank_score }));
  ```

- [ ] Write a test with known high-relevance vs. low-relevance pairs:
  assert high-relevance pair has higher score post-rerank

- [ ] Add a `--no-rerank` flag for benchmarking (to compare with/without)

- [ ] Commit: `fix(memory): verified reranker wiring — scores propagated to caller`

---

### Task 5.7 — Instruction prefixes + Matryoshka truncation (F5-ISSUE-12) [HIGH]

**Files:**
- Modify: `packages/memory/src/embedder.ts`

**Steps:**

- [ ] Add instruction prefix to query embedding:
  ```ts
  const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
  const DOC_PREFIX   = 'Represent the passage for retrieval: ';

  function embedQuery(text: string) {
    return embed(QUERY_PREFIX + text);
  }
  function embedDocument(text: string) {
    return embed(DOC_PREFIX + text);
  }
  ```

- [ ] Add Matryoshka truncation support: when `dimensions < full_dimensions`,
  slice the embedding vector to the requested size

- [ ] Write test: assert embeddings differ with/without prefix (cosine similarity
  between same-text query and doc embedding should increase with prefix)

- [ ] Commit: `feat(memory): instruction prefixes + Matryoshka truncation`

---

### Task 5.8 — Tree-sitter AST chunker (F5-ISSUE-01) [HIGH]

**Files:**
- Create: `packages/memory/src/chunkers/ast-chunker.ts`
- Modify: `packages/memory/src/chunkers/index.ts`

**Steps:**

- [ ] Install `tree-sitter` and language grammars:
  ```
  pnpm add -w tree-sitter @tree-sitter-lang/tree-sitter-typescript
  ```

- [ ] Write `ASTChunker` class:
  ```ts
  class ASTChunker implements Chunker {
    chunk(code: string, language: 'typescript' | 'python' | 'javascript'): Chunk[] {
      const tree = parser.parse(code);
      // Split at: function declarations, class declarations, method definitions
      // Include: name, doc comment, full body
      // Chunk boundary: node type in ['function_declaration', 'class_declaration', 'method_definition']
    }
  }
  ```

- [ ] Fall back to `SlidingWindowChunker` for languages without grammar support

- [ ] Write tests with TypeScript fixtures — assert chunks align with function boundaries

- [ ] Commit: `feat(memory): tree-sitter AST chunker for code`

---

### Task 5.9 — Separate code embedder path (F5-ISSUE-02) [HIGH]

**Files:**
- Modify: `packages/memory/src/embedder.ts`

**Steps:**

- [ ] When content is identified as code (via file extension or `language` field):
  use a code-specialized embedding model (e.g., `Xenova/code-search-net-model`
  or `nomic-ai/nomic-embed-code`)

- [ ] Otherwise: use the existing text embedder

- [ ] Add `content_type: 'text' | 'code'` field to the `memories` table
  (MIGRATION_027)

- [ ] Write test: code embedder produces higher similarity for code-to-code search

- [ ] Commit: `feat(memory): separate code embedder path + content_type column`

---

### Task 5.10 — Aider-style repo-map (F5-ISSUE-04) [MEDIUM]

**Files:**
- Create: `packages/memory/src/repo-map.ts`

**Steps:**

- [ ] Build a function `buildRepoMap(dir: string): string` that:
  1. Scans `.ts`, `.js`, `.py` files
  2. Uses tree-sitter (Task 5.8) to extract top-level declarations
  3. Returns a compact map in the format:
     ```
     packages/core/src/schema.ts:
       interface Task
       interface AgentRun
       function createTask(...)
     ```

- [ ] Store repo-map snapshots in memory with tag `type:repo-map`

- [ ] Expose via `mcp__fulcrum__build_repo_map` MCP tool

- [ ] Write test: assert repo-map contains expected declarations

- [ ] Commit: `feat(memory): Aider-style repo-map from tree-sitter declarations`

---

### Task 5.11 — Consolidation + decay jobs (F5-ISSUE-06) [MEDIUM]

**Files:**
- Modify: `packages/memory/src/consolidator.ts` (or create if not exists)

**Steps:**

- [ ] Implement memory decay: reduce `importance` by 10% per week for memories
  with `importance < 0.8` and no recent access

- [ ] Implement consolidation: cluster similar memories (cosine sim > 0.92),
  merge into a single summary memory, mark originals as `consolidated`

- [ ] Run from janitor cycle (`packages/core/src/janitor.ts`) weekly

- [ ] Write test: 3 similar memories → 1 consolidated memory after job runs

- [ ] Commit: `feat(memory): consolidation + decay jobs in janitor cycle`

---

### Task 5.12 — Ingestion quality gates (F5-ISSUE-07) [MEDIUM]

**Files:**
- Modify: `packages/memory/src/write.ts`

**Steps:**

- [ ] Add pre-write validation:
  - Minimum content length (reject < 20 chars)
  - Duplicate detection: if FTS5 exact match for content exists, skip write
  - Language detection: tag with detected language

- [ ] On quality failure, return `{ skipped: true, reason: string }` instead of error

- [ ] Write test: assert duplicate detection works

- [ ] Commit: `feat(memory): ingestion quality gates — dedup, min-length, language tag`

---

### Task 5.13 — Reranker sigmoid + batching (F5-ISSUE-15) [LOW]

**Files:**
- Modify: `packages/memory/src/reranker.ts`

**Steps:**

- [ ] Apply sigmoid normalization to raw reranker logit scores to bound to [0, 1]

- [ ] Batch requests: if `n` candidates > 16, split into batches of 16 and
  collect results (avoids OOM on large recalls)

- [ ] Commit: `fix(memory): reranker sigmoid normalization + batching`

---

### Task 5.14 — Single retrieval telemetry span (F5-ISSUE-13) [MEDIUM]

**Files:**
- Modify: `packages/memory/src/recall.ts`

**Steps:**

- [ ] Wrap the entire recall pipeline (FTS → vec → fuse → rerank) in a single
  `trace_events` span with fields:
  ```ts
  {
    trace_id, span_name: 'memory.recall',
    fts_candidates: number,
    vec_candidates: number,
    rrf_results: number,
    rerank_results: number,
    duration_ms: number
  }
  ```

- [ ] Commit: `feat(memory): single telemetry span for full recall pipeline`

---

### Task 5.15 — Fix `recall_memory` MCP tool description (F5-ISSUE-14) [LOW]

- [ ] Update `recall_memory` description in `mcp-tools.ts`:
  ```
  Hybrid semantic search over agent memory (FTS5 + vector + rerank). Returns
  the top-k most relevant memories for the given query in the specified scope.
  Requires workspace_id; project_id is optional (omit for workspace-wide recall).
  Returns: id, content (truncated to max_chars), score (0.0–1.0), tags.
  ```

- [ ] Commit: `fix(mcp): recall_memory tool description — accurate and complete`

---

## Deeper Research

1. **Tree-sitter Node.js bindings** — the `tree-sitter` npm package requires
   native compilation. Check if it's in `pnpm.onlyBuiltDependencies` and whether
   the ONNX runtime (already there) conflicts. Alternative: `web-tree-sitter` (WASM,
   no native compile).

2. **Code embedding models** — `nomic-ai/nomic-embed-code` is a good choice but
   is 137M parameters. Check inference speed vs. the existing text embedder.
   `Xenova/code-search-net-model` is smaller but older. Benchmark both.

3. **Kuzu graph query language** — F5-ISSUE-11 uses Cypher syntax. Verify Kuzu
   supports `CREATE (m:Memory {...})` and `MATCH ... CREATE` patterns. Kuzu's
   query language is Cypher-compatible but may have differences.

4. **RRF k parameter** — the standard `k = 60` was established for web search.
   For a small corpus (< 10k memories), a lower k (e.g., 20) may work better.
   The eval harness (Task 5.3) should be used to tune this.

5. **Matryoshka model compatibility** — instruction prefix and Matryoshka
   truncation only make sense for models trained with these features (e.g.,
   `nomic-ai/nomic-embed-text-v1.5`). Verify the currently-used model in
   `packages/memory/src/embedder.ts` supports them.

---

## Acceptance criteria

- Single canonical `writeMemory` + `recallMemory` implementation in `@moabualruz/fulcrum-memory`
- `writeMemory` creates a Kuzu `Memory` node on every call
- Retrieval eval harness: recall@5 ≥ 0.7 on fixture dataset
- RRF fusion in place of weighted sum
- Reranker scores propagated to `recall_memory` MCP tool response
- Tree-sitter chunker produces function-level chunks for TypeScript
- `pnpm test --filter memory` passes with all new tests
