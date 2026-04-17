# F5 — Memory + RAG Audit

> Critical audit of Fulcrum's memory pipeline, embeddings, chunking,
> hybrid search and rerank against
> [R5 — RAG, Embeddings, Tree-sitter, Memory](../research/r5-rag-memory.md).
>
> Scope: the code that ships on `main` as of 2026-04-14 — packages
> `fulcrum-core` (embedding registry + recall/write at `packages/core/src/memory.ts`)
> and `fulcrum-memory` (vault + Kuzu + extractors + tree-sitter-less
> chunker at `packages/memory/src/*`). Config defaults live in
> `packages/core/src/config.ts` and `packages/core/src/constants.ts`.
>
> Audit method: trace every line of `recallMemory` and `writeMemory`
> that runs in production, compare to R5 §§1–14 and the 13.1
> "MUST" checklist, and cite source `file:line` for every claim.
> Source-driven-development skill applied: R5 is the contract,
> external references are pinned by URL in §References.

Headline finding, up front so it's impossible to miss:

> **The dense-vector retrieval channel is non-functional in production.**
> `vec_memories` is created by the migration
> (`packages/core/src/db/migrations.ts:1014`) and queried in both
> recall paths
> (`packages/core/src/memory.ts:304`,
> `packages/memory/src/recall.ts:207`), but **no code path in the
> entire repository ever inserts a row into `vec_memories`**. Grep
> for `INSERT.*vec_memories` across the tree: zero hits. The
> `semantic` component of the §10.7 weighted ranking formula is
> therefore always 0, and `semantic * 0.4` always contributes zero.
> Every "semantic" recall result the user sees today is actually an
> FTS5 lexical hit with a decay multiplier and a BGE reranker
> occasionally applied on top. This is the single largest
> correctness issue in the memory layer.

Second-order headline: **there are two `recallMemory` implementations
and the production MCP server calls the wrong one.** The sophisticated
L0-vault / L2-Kuzu / RRF path lives in `packages/memory/src/recall.ts`.
The CLI MCP server (`packages/cli/src/index.ts:596`) and the HTTP
monitor (`packages/monitor/src/server.ts:8`) both import
`recallMemory` from `fulcrum-core`, hitting
`packages/core/src/memory.ts:211` — the simpler, weighted-sum path
that has no RRF, no vault write, no Kuzu query, no extraction, and no
scope composition. The `fulcrum-memory` package is effectively an
advanced prototype that no user-facing surface actually calls.

---

## Conformance strengths

Fulcrum does some things right against R5. Enumerated here so the
rest of the document can focus on gaps.

1. **Default embedder choice matches R5 §1.4.** `packages/core/src/config.ts:13`
   pins `onnx-community/Qwen3-Embedding-0.6B-ONNX` which is the
   exact model R5 §1.4 recommends as the local-first default
   (Apache 2.0, 1024-dim, instruction-aware). Dimension 1024 is set
   via `DEFAULT_EMBED_DIM` (`packages/core/src/constants.ts:18`)
   and threaded through to the `vec0` virtual-table schema
   (`packages/core/src/db/migrations.ts:1014`). Consistent.

2. **Default reranker matches R5 §5.7.** `config.ts:19` pins
   `onnx-community/bge-reranker-v2-m3-ONNX` — R5 §5.7's explicit
   recommendation for the local-first self-hosted default. License
   (Apache 2.0) and parameter count (≈570M) match what the audit
   research expected.

3. **FTS5 + BM25-rank fallback is in the right place.** Both recall
   implementations use SQLite FTS5 as the lexical retriever with a
   LIKE fallback on SQLITE_ERROR
   (`packages/memory/src/recall.ts:59`,
   `packages/core/src/memory.ts:265`). R5 §6.6 recommends
   "BM25 via SQLite FTS5" for exactly this slot, and the 2026-04-13
   fix to the FTS5 fallback (commit `18ff7ef`) is conformant.

4. **Reranker call site exists and is wired into the scoring loop.**
   Unlike many hand-rolled RAG systems where the reranker is imported
   but never called, Fulcrum's reranker *is* invoked at
   `packages/core/src/memory.ts:337` and the cross-encoder score
   replaces the `semantic` component before re-sorting. See §The reranker
   wiring audit below — it is wired, but it is wired into the wrong
   code path and the candidate count is wrong.

5. **RRF fusion exists — in the unused path.** `packages/memory/src/scoring.ts:29`
   implements the canonical `1/(k+rank)` RRF with `k=60` (R5 §6.2
   default). `packages/memory/src/recall.ts:226` uses it for
   candidate ordering. The problem is that this recall function is
   dead code from the MCP/monitor perspective (see next section).

6. **FTS5 content-sync triggers handle all four CRUD paths**
   (`migrations.ts:107–118, 296–310`), so the lexical index never
   gets stale relative to the `memories` table. That's one class of
   bug we're not shipping.

7. **SQLite `vec0` extension is loaded safely.** The virtual-table
   creation is wrapped in try/catch
   (`migrations.ts:1013`, `1041`) so schemas without `sqlite-vec`
   don't crash startup. Degrades gracefully — good. It just degrades
   to "every dense query returns nothing" with no log line, which is
   the worst possible silent failure mode (see §Findings — CRITICAL).

8. **Kuzu + extraction architecture actually works in the rebuild
   path.** `packages/memory/src/setup/rebuild.ts:114` does call
   `upsertMemoryToKuzu` with a real `FullMemory`, and
   `packages/memory/src/kuzu/upsert.ts` inserts the node, creates
   `MENTIONS` / `PRODUCED_IN` edges, and runs the structured extractor.
   The wiring *is* correct — it just isn't exercised by the
   hot path from the MCP server.

9. **Structured (rule-based) Track 1 extractor is implemented and
   tested.** `packages/memory/src/extractors/structured.ts` extracts
   wikilinks, ID prefixes, file paths, and task/run PRODUCED_IN
   edges — a reasonable rule-based baseline and what R5 §7.2
   LightRAG calls "single-pass rule extraction". It also dedups by
   `(edgeType, type, canonical)`. Sound design.

Nothing else in the checklist below inherits this level of credit.

---

## Reality check: what runs vs what's wired (trace)

This is the section that matters most. Tracing the end-to-end recall
path from `recall_memory` MCP tool call down to the returned rows.

### Trace 1 — MCP `recall_memory` → core.memory.ts (the actual hot path)

1. User calls the MCP tool `recall_memory`
   (`packages/cli/src/index.ts:958`).
2. Handler destructures `recallMemory` from `fulcrum-core`
   (`packages/cli/src/index.ts:596`).
3. That's `export { writeMemory, recallMemory } from './memory.js'`
   (`packages/core/src/index.ts:53`) — i.e.
   `packages/core/src/memory.ts:211`.
4. Line 215 opens DB. Line 229 initialises an empty `candidates`
   map.
5. Lines 251–261 build a WHERE clause: **`workspace_id` mandatory,
   `project_id` optional, `task_id` optional**. No scope filter.
   No kind filter. No `file_path` filter.
6. Lines 265–283 run the FTS5 search. FTS5 match is passed
   `input.query` **raw** — no phrase quoting, so a query like
   `fix foo.bar` is treated as the BM25 query token list
   `fix foo.bar`. If FTS5 syntax trips (e.g. a colon in an
   identifier), the LIKE fallback fires and tags every hit with
   `rank=0`, producing `normalizeFtsRank(0) = 1.0` — a *higher*
   lexical score than any real FTS hit will ever produce.
   (`packages/core/src/memory.ts:22`,`282`)
7. Lines 285–295 hydrate the FTS rowids via a second query, with the
   workspace/project/task WHERE applied again (correct: prevents
   cross-workspace leakage).
8. Lines 299–323 are the "vector ANN" block. `getTextEmbedder()`
   returns the warm Qwen3 pipeline. `embedder.embed(input.query)`
   computes a 1024-dim Float32. Then:
   `SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ?`.
   `vec_memories` is empty (see §Reality check #1 below) so this
   returns zero rows on every call that survives the try-block. The
   catch at line 320 silently swallows any error — including the
   case where `sqlite-vec` is not loaded at all — so the failure is
   invisible.
9. Line 325 — if the FTS5 hit zero rows and vec_memories is empty
   (which it always is), we return `[]`.
10. Lines 327–330 compute the weighted score
    `semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1`
    (`packages/core/src/constants.ts:27`). The `semantic` component
    is 0 for every candidate because step 8 contributed nothing.
    Effectively, the formula collapses to
    `0.3*lexical + 0.2*recency + 0.1*confidence`, max possible
    score 0.6.
11. Line 333 takes `slice(0, limit * 2)` and hands it to the reranker.
12. Lines 337–356 run `bge-reranker-v2-m3` on the candidate passages.
    This is the *only* place a cross-encoder ever sees the query.
    The cross-encoder score replaces `semantic`, then recomputes the
    weighted sum — so the reranker only gets to contribute
    `rerankerScore * 0.4` at most. This is an under-weighted use of
    a cross-encoder (R5 §5 expects the reranker to be near-authoritative,
    not diluted by three other signals).
13. Line 358 takes top-limit and returns.

Net effect: the user calls `recall_memory` and gets back the top-N
FTS5 hits weighted by lexical rank / recency / confidence, optionally
re-ordered by a cross-encoder that's dominated by the remaining 0.6
of weighted score. **Semantic recall is zero because `vec_memories`
is never populated.**

### Trace 2 — `packages/memory/src/recall.ts` (the advanced path that nobody calls)

This one is more sophisticated on paper:

1. `recallMemory` at `packages/memory/src/recall.ts:108` starts by
   checking `getKuzuClient()?.isReady`. If Kuzu is active and an
   embedder exists, it goes to the L2 path (`queryMemoriesL2`).
2. L2 (`packages/memory/src/kuzu/query.ts:79`) does:
   - vector index seed (`CALL QUERY_VECTOR_INDEX` — Kuzu HNSW)
   - 1-hop entity graph expansion on query-mentioned entities
   - 2-hop entity expansion
   - superseded-memory filter via `UPDATES` edges
   - contradiction detection via `CONTRADICTS` edges
   - fused scoring `1.0*vscore + 0.8*graphScore + 0.3*importance + 0.2*recency + 0.25*affinity`
   - MMR diversification (stub — falls back to score order, line 72
     explicitly says "A real implementation would pass candidate
     embeddings through")
3. If L2 is off (or the client isn't ready, or the vector call
   throws), fall through to L1: FTS5 + vec_memories + RRF at
   `packages/memory/src/recall.ts:160`.
4. L1 uses proper RRF (`rrfScore`, `packages/memory/src/scoring.ts:29`)
   multiplied by a stored `freshness` field
   (`packages/memory/src/scoring.ts:40`).
5. Returns `CompactMemory` or `FullMemory` depending on `mode`.

Problems with this path, even if you were to call it:

- It imports `vec_memories` from the same unpopulated virtual table,
  so the "dense" channel in L1 is also always empty. L2 uses Kuzu's
  HNSW which *is* populated by `upsertMemoryToKuzu` — but only
  during a rebuild.
- The **writer does not call `upsertMemoryToKuzu`**.
  `packages/memory/src/write.ts:132` calls `runExtractionPipeline`
  (`packages/memory/src/extractors/pipeline.ts:33`), which runs
  structured extraction and tries to
  `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid}) CREATE (m)-[:MENTIONS ...]`.
  The `MATCH` on `m:Memory {id: $mid}` matches *no rows* because
  the Memory node was never created — the pipeline upserts edges
  against a non-existent node. The result: every MENTIONS / PRODUCED_IN
  CREATE is a no-op, and the `.catch(() => {})` on line 57 swallows
  the Cypher error silently.
- Therefore even the L2 path is effectively empty in steady state:
  no Memory nodes, no edges, no entity graph. The only way data ever
  lands in Kuzu is by running the `rebuildFromVault` setup command,
  which re-reads markdown files from the L0 vault and upserts them
  into Kuzu. That is a setup-time operation, not a runtime path.

The `fulcrum-memory` package is, today, best described as
"scaffolding around an aspirational architecture that has never been
end-to-end wired". The only consumers of `recallMemory` from
`fulcrum-memory` are its own tests.

### Reality check #1 — is `vec_memories` ever written?

```
$ rg 'INSERT.*vec_memories' packages/
(zero results)
```

Zero. The virtual table is created, both recall paths read from it,
no path ever writes to it. The `LocalEmbeddingProvider.embed()`
method at `packages/core/src/embedding/local.ts:28` successfully
returns a Float32Array for any text, and both `writeMemory`
implementations accept an `embedding` argument, but:

- `packages/core/src/memory.ts:122` stores the Float32Array into the
  `memories.embedding` *BLOB column* as
  `Buffer.from(input.embedding.buffer)` (line 177). The recall path
  at line 304 queries `vec_memories`, not the BLOB column. The BLOB
  column is *only* consulted by the `cosineSimilarity` dedup check
  inside `writeMemory` (lines 154–172), which is a tangential
  dedup helper.
- `packages/memory/src/write.ts:46` does the same: stores the
  embedding in the BLOB column and never inserts into `vec_memories`.
- Neither the CLI MCP tool nor the monitor HTTP endpoint *provide*
  an embedding when calling `writeMemory` — they pass only
  `content`, `workspace_id`, `project_id`, `title`, `tags`. So even
  the BLOB column stays NULL for everything written through the
  production surface.

This is a critical correctness bug, not a documentation one.

### Reality check #2 — is the reranker ever called in the production path?

Yes: `packages/core/src/memory.ts:337–356`. It runs on every
`recall_memory` MCP call when the FTS5 returns at least 2 hits. The
model is warmed up at process startup by
`packages/cli/src/index.ts:605` → `warmEmbedding` → `initEmbedding`
→ `LocalRerankerProvider.warmUp()`. Latency is real — every recall
eats a cross-encoder pass. No one has measured it under load.

### Reality check #3 — is the L0 vault ever written?

Yes: `packages/memory/src/write.ts:79–98` writes a markdown file
under `.fulcrum/vault/memories/…` whenever the vault path exists,
and appends a line to `log.md`. But only if the caller uses
`fulcrum-memory`'s `writeMemory`, *not* `fulcrum-core`'s. Since
the CLI calls `fulcrum-core`'s, the vault stays empty for every
memory that comes in via `write_memory` MCP tool. The post-tool hook
at `packages/cli/src/index.ts:434` also uses `fulcrum-core`, so
`tool_trace` memories also bypass the vault.

### Reality check #4 — is `recall_memory` actually semantic?

The MCP tool description at `packages/cli/src/index.ts:675` says
"semantic query". In practice it is pure FTS5 + recency +
confidence + reranker, with the "semantic" component weighted at
0 because `vec_memories` is empty. The user is being told the system
does semantic search when it does not.

---

## Findings — CRITICAL

### C-1. `vec_memories` is never populated

- **Evidence:** `rg 'INSERT.*vec_memories' packages/` → 0 hits.
  Virtual table created at `packages/core/src/db/migrations.ts:1014`.
  Queried at `packages/core/src/memory.ts:304` and
  `packages/memory/src/recall.ts:207`.
- **Impact:** Dense-vector recall is a no-op on every call. The
  weighted ranking formula collapses from
  `0.4·semantic + 0.3·lexical + 0.2·recency + 0.1·confidence` to
  `0.3·lexical + 0.2·recency + 0.1·confidence` — max score 0.6, no
  semantic signal.
- **R5 citation:** §6.6 ("First stage: BM25 ∪ dense ∪ repo-map.
  RRF fuse.") and §13.1 MUST ("Hybrid retrieval: BM25 + dense,
  fused via RRF. Neither alone is acceptable.")
- **Status:** Blocker. The product claims semantic search.
- **Fix sketch:** in `writeMemory`, after the INSERT, embed the
  content (via `getTextEmbedder().embed(content)`), store the
  resulting Float32 into `vec_memories` via
  `INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)` using
  the row's `rowid` (from `lastInsertRowid`) and
  `Buffer.from(vec.buffer)`. Gate on `sqlite-vec` availability. Do
  the same in `update` paths. Backfill existing rows with a
  one-shot reindex command.

### C-2. Two `writeMemory` / `recallMemory` implementations — the production MCP calls the weaker one

- **Evidence:**
  - `packages/core/src/index.ts:53` re-exports `writeMemory, recallMemory`
    from `./memory.js`, which is a simple SQLite-only path without
    vault, Kuzu, RRF, extraction, MMR, or scope composition.
  - `packages/memory/src/index.ts:27,33` exports the full-pipeline
    versions (vault write, L2 enqueue, extraction, RRF, L2 HNSW).
  - `packages/cli/src/index.ts:596,435,450` and
    `packages/monitor/src/server.ts:8,556,589` all import from
    `fulcrum-core`, not `fulcrum-memory`.
  - Tests for `fulcrum-memory` exist but no production surface
    calls any of them.
- **Impact:** Every design gain in `fulcrum-memory` (L0 git-backed
  vault, Kuzu graph, structured extraction, MMR, freshness, RRF,
  scope composition) is not reachable from end-user tools.
- **R5 citation:** §8 memory architectures (tiered / scoped),
  §7.3 Graphiti-style temporal graph, §13.1 MUST ("Scope
  enforcement", "Provenance on every memory row").
- **Status:** Blocker. We ship two APIs that claim to be one.
- **Fix sketch:** delete `packages/core/src/memory.ts` and re-export
  `fulcrum-memory`'s versions from `fulcrum-core`. This is a
  breaking change for any internal caller that expects the core
  signature — but per C-1 they are already broken. Reconcile the
  interfaces first: the core version returns `Memory[]` while the
  memory version returns `CompactMemory[] | FullMemory[]` with a
  `mode` discriminator.

### C-3. `runExtractionPipeline` writes edges against a non-existent Memory node

- **Evidence:** `packages/memory/src/write.ts:132` calls
  `runExtractionPipeline(vaultRoot, ...)`. The pipeline at
  `packages/memory/src/extractors/pipeline.ts:54` executes
  `MATCH (m:Memory {id: $mid}), (e:Entity {id: $eid}) CREATE (m)-[:PRODUCED_IN ...]->(e)`.
  But the Memory node is only created by `upsertMemoryToKuzu`, which
  is only called from `setup/rebuild.ts`, never from `write.ts`.
  `writeMemory` therefore produces zero Kuzu edges in steady state.
  The `.catch(() => {})` at line 57 hides the failure.
- **Impact:** L2 graph expansion at
  `packages/memory/src/kuzu/query.ts:127` has nothing to expand
  from. `MENTIONS` / `PRODUCED_IN` edges exist only in rebuild
  snapshots. The 1-hop and 2-hop stages in `queryMemoriesL2`
  always return zero rows on freshly-written memories.
- **R5 citation:** §7.3 Graphiti — temporal knowledge graph edges
  must be appended on each fact write, not on periodic rebuild.
- **Status:** Blocker. Even if C-1 and C-2 were fixed, this would
  still render the graph retrieval path non-functional.
- **Fix sketch:** in `write.ts`, after the L1 SQLite insert, call
  `upsertMemoryToKuzu(kuzuClient, rowToFullMemory(row), embedding)`
  before firing the extraction pipeline. Or consolidate the entire
  pipeline into a single transactional write helper.

### C-4. No code-specific retrieval path — `tree-sitter` is not a dependency

- **Evidence:** `rg tree-sitter packages/**/package.json` → 0 hits.
  The chunker at `packages/memory/src/ingest.ts:25` is a single
  regex `SYNTAX_BOUNDARIES = /(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm`.
  Languages "supported" at line 10 are just a whitelist that
  chooses the regex over a paragraph splitter; every non-TS/JS/Py
  language still gets the same JavaScript-biased regex.
- **Impact:** Code retrieval is, functionally, BM25 over plain-text
  chunks. The regex splits at TS/JS function/class declarations but
  misses: arrow functions assigned to `const`, TS `type`/`interface`
  declarations, Python `def`, Rust `fn`, Go `func`, Java methods,
  any decorator-prefixed symbol, any default export, any nested
  function, any class method. That is 90% of the symbols in any
  real codebase.
- **R5 citation:** §3 (tree-sitter is non-negotiable for code),
  §4.1 ("function-level chunking beats window chunking by 8–15
  nDCG points"), §10 (all production code-search systems
  — Aider, Continue, Sweep, Sourcegraph — use tree-sitter or
  better), §13.1 MUST ("Tree-sitter chunking for code in the
  supported language list").
- **Status:** Blocker for the "agent coding workflow" value
  proposition.
- **Fix sketch:** add `web-tree-sitter` + language wasms as
  dependencies; build a chunker module that runs `.scm` queries to
  extract definitions and references. See F5-ISSUE-01.

### C-5. No scope composition in production recall

- **Evidence:** `packages/core/src/memory.ts:251–261` builds a WHERE
  clause that filters by `workspace_id`, optionally `project_id`,
  optionally `task_id`. There is **no UNION or multi-scope search**.
  If a memory is written at `scope=global` (project_id=NULL), a
  recall with `project_id='p1'` will add `m.project_id = 'p1'` and
  exclude the global memory. The caller has no way to ask "search
  project *and* global".
- **Impact:** Global / workspace-wide memories are invisible to
  task-scoped recalls. The four-scope taxonomy
  (`global | project | file | task` — `types.ts:47`) is
  decorative.
- **R5 citation:** §9.2 ("At retrieval time, multiple scopes get
  searched and merged; more-specific scope wins on ties"), §13.1
  MUST.
- **Status:** Blocker for multi-scope use cases.
- **Fix sketch:** change the WHERE builder to emit
  `(project_id = ? OR project_id IS NULL) OR task_id = ?`, with a
  per-scope bonus applied during scoring so
  task > file > project > global for ranking ties.

### C-6. MCP tool `recall_memory` claims to be semantic; it is not

- **Evidence:** `packages/cli/src/index.ts:675` — tool description
  says *"Recall relevant memories from the project memory store by
  semantic query"*. Combined with C-1 and the fact that
  the MCP-invoked `recallMemory` never populates the query embedding
  from a BLOB column either, the user-facing description is
  materially false.
- **Impact:** users (and Claude agents reading the tool descriptor)
  will plan as if they can write paraphrased queries and recover
  relevant facts. They cannot — only BM25 matches survive.
- **Status:** Blocker on truthfulness of the product surface.
- **Fix sketch:** fix C-1 to make the claim true, or until then
  update the tool description to "lexical + recency recall with
  optional cross-encoder rerank".

---

## Findings — HIGH

### H-1. `MEMORY_RANK_WEIGHTS` formula is invented, not from R5

- **Evidence:** `packages/core/src/constants.ts:27` —
  `{ semantic: 0.4, lexical: 0.3, recency: 0.2, confidence: 0.1 }`
  with a comment "§10.7". That is a Fulcrum internal spec section,
  not R5. R5 §6.2 recommends RRF (`1/(k+rank_i(d))`, k=60), and
  R5 §8.2 Park-et-al gives
  `score = α·recency + β·importance + γ·relevance` with defaults
  `α=β=γ=1` — an entirely different parameterisation.
- **Impact:** The weighted-sum formula mixes signals on
  non-comparable scales (FTS5 BM25 rank vs cosine similarity vs
  decay-weighted age vs user-provided confidence) without any
  normalisation justification. The research that RRF exists to
  *avoid* this normalisation problem (R5 §6.2) is not cited.
- **Empirical validation:** none. No benchmark is referenced in
  the code, the audit trail, or test cases. The weights appear to
  be chosen by spec-writer intuition.
- **Note:** `packages/memory/src/scoring.ts` already implements RRF
  correctly — it just isn't used by the production path.
- **Fix sketch:** delete `MEMORY_RANK_WEIGHTS`, port the RRF fusion
  from `fulcrum-memory` into the production path, and drop
  `confidence` / `recency` from the fusion stage into a post-RRF
  multiplier (à la `scoring.ts:recallScore`).

### H-2. Reranker is weighted at 0.4, not used as a near-authoritative reranker

- **Evidence:** `packages/core/src/memory.ts:346` —
  `const semantic = Math.max(0, Math.min(1, rerankerScore))` then
  re-runs `hybridScore({ ...c, semantic })` on line 350. The
  cross-encoder score is injected only into the `semantic`
  channel, which carries 0.4 of the total weight. A cross-encoder
  that confidently says "this passage is the answer" can at best
  add 0.4 to a candidate's score.
- **Impact:** Cross-encoder signal is diluted by first-stage noise.
  R5 §5 treats the reranker as authoritative: rerank top-50 and
  return the cross-encoder's top-k unchanged.
- **R5 citation:** §5.1 ("standard production pattern: bi-encoder
  retrieves top-K, cross-encoder reranks to top-k"), §5.7
  ("Rerank top-50 from first stage to top-10") — not "blend the
  cross-encoder into a weighted sum".
- **Fix sketch:** in the reranker stage, sort by rerankerScore
  directly (descending), take top-k, return. Use the weighted
  hybrid formula *only* for selecting the top-50 candidates fed
  into the reranker.

### H-3. Candidate pool into reranker is `limit * 2`, not 50–100

- **Evidence:** `packages/core/src/memory.ts:333` — the sorted list
  handed to the reranker is `slice(0, limit * 2)`. For the default
  `limit=5` that's **10 candidates**. For the MCP tool's default
  `limit=10` that's 20.
- **Impact:** The reranker can only reorder within a tiny pool. If
  the correct answer isn't in the top-10 lexical+recency slice, the
  reranker cannot recover it. R5 §5.1 and §5.4 both specify
  rerank at 50–100 candidates for a CPU-budget-friendly cross-encoder.
- **Fix sketch:** rerank top-50 (configurable), return top-k.

### H-4. Single embedder for text and code

- **Evidence:** `packages/core/src/config.ts:33` — default config
  is `{ text: DEFAULT_TEXT_EMBEDDING, code: null }`.
  `getCodeEmbedder()` at `registry.ts:29` falls through to the text
  provider when `code` is null. There is no code-embedder model in
  defaults. Even when both are set, only one `vec_memories` table
  exists; there is no second index.
- **Impact:** R5 §2.1 says code-specific embedders beat general
  text embedders on code retrieval by 10–20%, and the gap is worse
  for code-to-code queries. Qwen3 general is acceptable for
  NL→code queries (R5 §2.5), but the single-table storage means
  you can't A/B a separate code embedder without schema changes.
- **R5 citation:** §2.5 ("If we can afford a second model slot:
  use `jina-code-embeddings-0.5B` alongside Qwen3-0.6B"), §13.1
  MUST-alternative.
- **Fix sketch:** add a `vec_code_chunks` virtual table in
  migrations with its own dimension (jina-code v1 = 768, v2-base-code
  = 768), populate it from the code ingestion path, route
  code queries through `getCodeEmbedder()`. Leave `vec_memories`
  for non-code memories.

### H-5. No Matryoshka truncation support

- **Evidence:** `EmbeddingProviderConfig.dimensions` at
  `packages/core/src/types.ts:264` is a single number. There is no
  `queryDimensions` or `storeDimensions`. `vec0(embedding float[1024])`
  fixes the storage dimension. `LocalEmbeddingProvider.embed()`
  (`local.ts:28`) returns whatever the pipeline gives.
- **Impact:** Qwen3-Embedding-0.6B supports Matryoshka truncation
  down to 32 dimensions; R5 §1.3 notes a coarse-index-at-256-dim
  pattern for 10–100× cheaper recall. None of this is available.
- **Fix sketch:** add `queryDimensions` and `storeDimensions` to
  the embedding config; truncate to `storeDimensions` before
  BLOB insertion; optionally maintain a second `vec_coarse`
  virtual table for coarse ANN.

### H-6. No instruction prefix for queries vs documents

- **Evidence:** `LocalEmbeddingProvider.embed()` is a single method
  with no `role: 'query' | 'document'` parameter. Qwen3 is an
  instruction-aware decoder-style embedder that expects
  `Instruct: Given a web search query, retrieve relevant passages...\nQuery: ...`
  for queries, and plain text for passages (R5 §1.3).
- **Impact:** R5 §1.3 says instruction prefixes give +1–3 nDCG points
  on asymmetric retrieval. Without them, Qwen3 is being used as a
  base BERT-style embedder and leaves quality on the table. Also —
  if documents are indexed without the document prefix and queries
  are embedded without the query prefix, the asymmetric bonus is
  at least consistent. But at the moment we *claim* to use an
  instruction-tuned model and don't give it instructions.
- **Fix sketch:** add `embed(text, { role })` to the interface;
  prepend the model-family-specific prefix; document the prefix in
  config so other providers can override.

### H-7. No freshness job, no decay, no reflection

- **Evidence:** The `memories.freshness` column is created at
  `migrations.ts:225` (approximately) and written at
  `packages/memory/src/write.ts:120` with a default of 1.0. The
  janitor at `packages/core/src/janitor.ts` handles stale runs,
  escalation, locks and worktrees — no memory operations.
  `rg 'freshness|decay' packages/core/src/janitor.ts` returns
  zero hits.
- **Impact:** R5 §8.2 + §11.5 make decay + reflection core
  requirements (Park et al.; Mem0's auto-consolidation). Without
  decay, `freshness` is whatever the writer passed — fixed at 1.0
  for every memory. `scoring.computeFreshness` (linear 90-day
  decay) is defined but never *stored* — it's a pure helper that
  no code reads.
- **R5 citation:** §8.2 decay formula, §8.5 reflection loop,
  §11.5 decay job, §13.2 SHOULD.
- **Fix sketch:** add `runMemoryDecayCycle` to janitor (idle-time,
  not every 60s — hourly is fine). Add `runMemoryReflectionCycle`
  that samples top-K memories by importance and LLM-summarises
  them into new semantic memories (requires LLM integration layer
  — see T-1).

### H-8. `semantic.ts` extractor is a stub that returns `[]`

- **Evidence:** `packages/memory/src/extractors/semantic.ts:19` —
  `extractSemantic` always returns `[]` with a TODO comment:
  "integrate with fulcrum-core LLM client". The file is imported
  by nothing (`rg extractSemantic packages/`).
- **Impact:** Track 2 LLM extraction (R5 §7.2 LightRAG, §8.3 Mem0)
  is nominally supported but not implemented. Only Track 1 rules
  (wikilinks, ID prefixes, file paths) create edges. The graph
  therefore only contains edges for things the user literally
  typed as `[[type/name]]`.
- **Fix sketch:** integrate with whatever LLM client layer lands
  in pi-agent-os. Until then, remove the stub to avoid signalling
  it works.

### H-9. No ingestion quality gates beyond exact-dedup

- **Evidence:** `packages/memory/src/write.ts:16–44` does input
  validation (non-empty title/content, confidence/freshness/importance
  in [0,1]) then exact SHA-256 dedup. No length limits, no PII
  filter, no importance floor, no schema-validated structure
  (other than the TS interface), no near-duplicate detection.
  `packages/core/src/memory.ts:154–172` does have an embedding
  cosine > 0.9 near-dup check — but only when the caller passes an
  embedding, which MCP never does.
- **R5 citation:** §11.3 quality gates.
- **Fix sketch:** add a `validateMemoryForWrite()` helper that
  enforces body ≤ 8k chars, runs a PII redaction pass, checks
  importance floor (default ≥ 0.3 except for `explicit=true`
  writes), and rejects content shorter than ~12 chars. Near-dup
  detection at 0.95 cosine replaces write with an access-bump.

### H-10. No evaluation harness, no retrieval metrics

- **Evidence:** `rg -l 'BEIR|MTEB|CoIR|recall@10|nDCG' packages/`
  returns zero hits. No in-repo benchmark corpus, no per-PR recall
  gate, no latency measurements.
- **R5 citation:** §12 (BEIR / MTEB / CoIR / SWE-bench), §13.2 SHOULD,
  §14 ("Evaluation: in-repo test corpus + recall@10 / nDCG@10 /
  memory retrievability test; run on every PR that touches the
  retrieval stack.")
- **Impact:** Nobody can tell whether a refactor of the retrieval
  stack helps or hurts. The audit's own fixes to C-1 through C-6
  would ship without a measurement.
- **Fix sketch:** F5-ISSUE-08 below. Minimum: a fixture of 50
  `(query, expected_memory_id)` pairs and a `bun run test:recall`
  script that reports `recall@5` and latency percentiles.

---

## Findings — MEDIUM

### M-1. `normalizeFtsRank` is a 1-parameter hack that over-rewards LIKE fallback

- **Evidence:** `packages/core/src/memory.ts:22` —
  `return 1 / (1 + Math.abs(rank))`. When FTS5 returns a BM25
  rank of `-12.3` this gives 0.0752. When the LIKE fallback
  returns `rank=0` (synthesised at line 282) this gives `1.0` —
  meaning a LIKE fallback hit *always* outscores any real FTS hit.
  The LIKE fallback triggers on any FTS5 error, e.g. a query with
  a bare colon or a reserved word.
- **Impact:** Pathological ranking when a single FTS5 parse error
  sends one query through the LIKE branch — the whole result set
  is biased toward fallback.
- **Fix:** give LIKE fallback a synthetic rank that
  `normalizeFtsRank` scores at ≤ 0.5 (e.g. rank=20), or use RRF so
  only rank order matters, not magnitude.

### M-2. FTS5 query string is not quoted in core path

- **Evidence:** `packages/core/src/memory.ts:273` —
  `.all(input.query, ...)` passes the query raw. By contrast
  `packages/memory/src/recall.ts:197` wraps the query in
  `"${input.query.replace(/"/g, '""')}"` as a phrase literal.
- **Impact:** core path trips on any query containing FTS5
  operators (`AND`, `OR`, `NOT`, `"`, `*`, `:`). User types
  "migration: fix NULL handling" → FTS5 sees `migration` column
  prefix, errors, LIKE fallback kicks in (see M-1).
- **Fix:** adopt the memory-package quoting pattern in core.

### M-3. Recall path sorts then slices, then re-sorts — sort is redundant

- **Evidence:** `packages/core/src/memory.ts:333` sorts by
  `b.score - a.score` and slices top `limit*2`. Then the reranker
  re-sorts the same slice. The first sort is only useful for
  choosing *which* candidates to hand the reranker. A larger
  candidate pool (see H-3) would obviate this entirely.

### M-4. `recencyScore` in core vs `computeFreshness` in memory — two decay models

- **Evidence:**
  - `packages/core/src/memory.ts:13` — exponential 30-day
    time-constant, `Math.exp(-ageDays / 30)`.
  - `packages/memory/src/scoring.ts:20` — linear 90-day decay,
    `Math.max(0, 1 - daysSinceUpdate / 90)`.
  - `packages/memory/src/kuzu/query.ts:28` — exponential 30-day
    half-life, `Math.exp(-daysOld / 30 * Math.log(2))`.
- **Impact:** three different decay formulas in three different
  places. A memory aged 30 days gets recency=0.37 (core exponential),
  recency=0.66 (linear), or recency=0.5 (Kuzu half-life). Which
  one defines "fresh" depends on which recall path is taken.
- **Fix:** pick one (R5 §8.2 defaults to half-life 24 hours for
  interactive agent memory; for long-lived codebase memory,
  30-day half-life is fine), centralise in `scoring.ts`,
  re-export.

### M-5. `MemoryKind` has 16 values with no episodic/semantic/procedural split

- **Evidence:** `packages/core/src/types.ts:49` — 16 values, no
  taxonomy, no code path treats them differently beyond string
  match. The memory package categorises them into `CURATED_KINDS`
  vs `OPERATIONAL_KINDS` at `packages/memory/src/types.ts:172`
  (curated = 8, operational = 8). Track 2 LLM extraction only runs
  on five of them (`pipeline.ts:68`).
- **R5 citation:** §8.1 episodic / semantic / procedural taxonomy.
- **Impact:** no retrieval weighting by memory type, no
  consolidation pipeline (operational → curated), no decay
  parameter per kind.
- **Fix:** tag each kind with an episodic/semantic/procedural
  label (lot of kinds are obviously one or the other:
  `tool_trace`, `reasoning_step` → episodic; `fact`, `decision`,
  `doc`, `summary` → semantic; `procedure` → procedural). Add
  per-kind retrieval weights and decay half-lives.

### M-6. `freshness` column is stored, never updated

- **Evidence:** `migrations.ts` adds `freshness` column (default 1.0
  via `writeMemory`, `write.ts:120`). No code anywhere writes it
  after insert except `insertMemoryDirect`. `scoring.computeFreshness`
  exists and computes a decayed value from `updated_at`, but it is
  only used inside `recallScore` — a pure-function path — and the
  column itself stays at 1.0.
- **Impact:** the stored freshness is not actually "fresh"-weighted
  storage; it's a misleading name. R5 §8.2 and §11.5 expect decay
  to *update stored state* so future recalls see decayed scores
  without recomputing the age from `updated_at`.
- **Fix:** either drop the column and always compute on read, or
  run a nightly decay job that updates it. The latter is R5's
  recommendation.

### M-7. Entity extraction is regex-only; LLM-based Track 2 is a stub

- **Evidence:** already covered by H-8. Listed here as medium because
  even the Track 1 rule set is narrow: only languages `ts/js/py/rs/go`
  + a handful of id prefixes. No person, organization, framework,
  version, API name extraction.
- **R5 citation:** §7.1 GraphRAG entity extraction prompt.
- **Fix:** add a small NER pass (spaCy or a tiny local model) for
  languages that matter; keep regex as fast-path.

### M-8. Scope taxonomy has 4 values vs R5's 7

- **Evidence:** `packages/memory/src/types.ts:9` —
  `'global' | 'project' | 'file' | 'task'`. R5 §9.1 lists
  turn/thread/session/workspace/user/org/global — 7 scopes.
  Fulcrum's taxonomy conflates workspace into project and has no
  user/org/thread scopes.
- **Impact:** can't express "this preference is mine across all
  projects" or "this is for my team, not my users". Multi-user
  futures are unaddressed.
- **Fix:** extend scope enum; add `workspace_id` + `user_id` +
  `project_id` filters compositionally. Non-breaking if new
  scopes default to the closest existing one.

### M-9. Importance is user-provided, not computed

- **Evidence:** `packages/memory/src/write.ts:25` accepts `importance`
  as an input parameter, validates range, stores. `scoring.computeImportance`
  (`scoring.ts:7`) computes a dynamic importance from
  access_count + entity_links + confidence but is never used by
  recall or stored.
- **R5 citation:** §8.2 ("Importance score: LLM-assigned 1–10 at
  write time, factored into retrieval"), §8.5 Park et al.
  reflection loop.
- **Fix:** use `computeImportance` as a base, add LLM-generated
  importance at write time behind a flag.

### M-10. No per-query weight tuning

- **Evidence:** `hybridScore` (`core/memory.ts:35`) uses global
  constants. There's no path to bump `lexical` when the query
  looks like an exact identifier (camelCase, snake_case, file path,
  ID prefix).
- **Fix:** a small query-type classifier upstream of recall that
  sets per-query weights.

---

## Findings — LOW

### L-1. `cosineSimilarity` at `memory.ts:110` is duplicated; exists nowhere else but is only used by dedup

- Not wrong, just homeless. Move to a shared `fulcrum-core/math.ts`
  and reuse.

### L-2. `Buffer.from(input.embedding.buffer)` is unsafe if the Float32Array is a view over a larger buffer

- `memory.ts:177` —
  `Buffer.from(input.embedding.buffer)` ignores `byteOffset` and
  `byteLength`. If the caller passes a subarray of a larger buffer
  (as `embedder.embed` *does* with transformers.js pooling), the
  BLOB contains garbage bytes.
- **Fix:** `Buffer.from(input.embedding.buffer, input.embedding.byteOffset, input.embedding.byteLength)`
  — or switch to `Buffer.from(input.embedding)` which handles this.

### L-3. Access-count update is not rate-limited

- `memory.ts:362` updates `access_count` + `last_accessed_at` on
  every successful recall. Under a hot loop of identical recalls
  this is write amplification. Not a bug, but worth a noted
  "batch every N seconds" option.

### L-4. `vec_chunks` is defined in the schema but never referenced

- `migrations.ts:1042` creates `vec_chunks` (presumably for code
  chunks). `rg 'vec_chunks' packages/` returns only the migration
  line. Dead schema.

### L-5. `memory.ts`'s `recallMemory` accepts only workspace_id as
required but the function silently returns `[]` for invalid input

- `memory.ts:214` — `if (limit <= 0) return []` is fine, but
  `project_id=undefined` passes through unchanged into the WHERE
  clause (i.e. the filter is just dropped). Intended? Maybe.
  Undocumented.

### L-6. `MemoryKind` re-export dance between core and memory packages adds nothing

- `packages/memory/src/types.ts:6-7` re-exports from core. Harmless
  but means the type is authored in two places; most of the
  `MemoryKind` values in the core union are meaningless in the
  memory package's curated/operational split.

### L-7. `onnx-community/*-ONNX` model names hard-coded

- `packages/core/src/config.ts:13,19`. A user can override via
  `.fulcrum.json` but the defaults are opinionated. Non-issue but
  worth documenting.

### L-8. No telemetry on retrieval latency

- The janitor instruments itself with spans
  (`janitor.ts:26`). Recall has no span. There is no way to see p50
  / p95 retrieval latency in production.

### L-9. `recallMemory` in core path never returns `last_accessed_at` bumps in the returned object

- Updates the DB (line 365) but returns pre-bump row objects. Minor.

### L-10. `graph.ts` in `fulcrum-memory` is a plain SQLite adapter parallel to Kuzu

- 342 lines of CRUD on SQLite-backed `graph_entities`/`graph_edges`/
  `graph_episodes` tables. Nothing calls it from recall. Appears
  to be a parallel Graphiti-style graph store that's also orphaned.
  Dead or WIP — either way, not wired.

---

## The code-vs-text gap (single biggest finding)

R5 §2, §3, §4, §10 are collectively a very long argument that **code
and prose need different retrieval stacks**. Fulcrum ships one stack,
and that stack treats code as prose.

Specifically:

1. **Same embedder for both.** `config.ts:33` defaults to
   `code: null`, so `getCodeEmbedder()` falls through to Qwen3
   general. R5 §2.5 says Qwen3 is acceptable for NL→code queries
   (because the model is decoder-style instruction-tuned on mixed
   text+code) but loses 5–10% on code-to-code retrieval relative
   to `jina-code-embeddings-0.5B`. That loss is baked in today.

2. **Same chunker for both.** The regex chunker at
   `ingest.ts:25` does *some* function/class splitting for TS/JS,
   but it's not AST-aware: it doesn't know about arrow functions,
   method definitions, TS `type` / `interface`, Python `def`,
   Go `func`, Rust `fn`, Java class bodies, or *any* non-TS/JS
   language's syntax. R5 §4.1 empirical evidence: line-window
   chunking underperforms function-level by 8–15 nDCG points.

3. **Same FTS5 tokenizer for both.** No code-specific tokenizer;
   SQLite FTS5's default tokenizer splits on whitespace and Unicode
   word boundaries. Identifiers like `getUserById` get tokenised as
   one token (good — exact-match queries work) but camelCase
   subtokens (`get`, `User`, `By`, `Id`) are not indexed. R5 §6.1
   ("BM25 wins on exact-identifier queries") works in Fulcrum only
   when the user types the full identifier.

4. **Same scoring formula for both.** The §10.7 weighted sum makes
   no distinction by kind or file_path. R5 §10 systems adjust
   ranker weights when the query looks like code vs prose.

5. **No symbol graph.** R5 §3.1 Aider repo-map is 80 lines of
   pseudocode describing a PageRank over a symbol reference graph.
   Fulcrum has: no repo-map, no symbol table, no cross-file symbol
   resolution. The `entity_type: 'symbol'` tag exists
   (`extractors/structured.ts:6`) but only as a label for wiki-link
   mentions.

6. **No NL→code query reformulation.** R5 §10.3 HyDE, query
   expansion by extracted identifiers, task-type prefixes. None
   implemented.

7. **No stacked retrieval.** R5 §10.4 file→symbol→line. Fulcrum is
   flat: all memories / chunks live in one table with one index.

**Severity:** CRITICAL for "agent-that-edits-code" positioning.
The user's expected mental model — "I can ask Fulcrum where the
retry logic is and it will find it" — is not met by the current
implementation on anything but exact-string matches.

---

## The chunking gap

Reviewing `packages/memory/src/ingest.ts` end to end against R5 §4.

Current state:

- `chunkSyntax` (line 27) splits on the regex
  `(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm`.
  Multi-line mode, lookahead at line start. Fires only on the
  literal TS/JS tokens `function` or `class`, optionally prefixed
  by `export ` and/or `async `.
- `chunkSemantic` (line 77) splits on `\n\n+` paragraphs with a
  50-char overlap for oversized pieces (`PROSE_OVERLAP = 50`).
- `MAX_CHUNK_CHARS = 1600` — about 400 tokens, reasonable against
  R5 §4.4 ("512-token chunks with 64-token overlap").
- `CODE_LANGUAGES = {typescript, javascript, python, java, go, rust, c, cpp}`
  (line 10). But the regex only recognises TS/JS constructs.
  Python / Rust / Go / Java / C / C++ files therefore go through
  `chunkSyntax` with a regex that matches *nothing*, triggering
  the fallback at line 59: "treat whole file as one chunk, or
  split by char count if > 1600 chars". For anything other than
  JS/TS, chunks are literally character windows.

R5 §4.4 Fulcrum stance (reproduced):
> Code: tree-sitter at function/class boundary, zero overlap,
> sliding window fallback for files without definitions.

That is the spec; the code does the opposite: it uses a JS-biased
regex for all languages in the allowlist, and character-window
fallback for everything else (including non-allowlisted code like
.kt, .swift, .rb, .php, .sh, and even Markdown unless it happens
to match the paragraph splitter).

- **No symbol metadata beyond `symbolPath`.** R5 §3.6 chunking best
  practice #4: attach imports, nearest docstring, callers/callees
  as metadata. Fulcrum stores: `file_path`, `symbol_path`,
  `start_line`, `end_line`, `content_hash`. No imports, no
  docstring, no callers. Cross-file retrieval is impossible.

- **Chunk overlap is wrong for code.** `chunkSemantic` uses 50-char
  overlap on prose; `chunkSyntax` has overlap=0 via
  `splitByMaxSize(part, MAX_CHUNK_CHARS, 0)` — but only for
  oversized functions. Paragraphs that get split by char count do
  get overlap, which is fine.

- **No module-level summary chunk** per R5 §3.6 #5. A query like
  "what is in auth/jwt.ts" won't find a file-summary chunk because
  we don't make one.

- **Chunks are indexed but not hydrated into the memory layer
  meaningfully.** `ingest.ts:154` writes a Memory with
  `title = basename: symbolPath`. That's all the structure the
  retrieval layer ever sees. No callee graph, no import graph, no
  anchor for cross-file queries.

**Fix:** F5-ISSUE-01 — replace `chunkSyntax` with a tree-sitter-based
implementation.

---

## The reranker wiring audit

Given the frequency of "reranker imported but never called" bugs,
this deserves its own section. Result: **the reranker is wired, but
wired wrong and wired only into the weaker of the two recall paths.**

Traced call graph:

1. `initEmbedding(config)` at `packages/core/src/embedding/registry.ts:10`
   constructs a `LocalRerankerProvider` and warms it.
2. `warmEmbedding()` at `packages/cli/src/index.ts:552` calls
   `initEmbedding` at process startup for every CLI entry point
   (`serve mcp`, `serve http`, `post-hook`, `pre-hook`).
3. `getReranker()` at `registry.ts:30` returns the singleton.
4. `packages/core/src/memory.ts:337` calls `getReranker()` inside
   `recallMemory`. If non-null and `sorted.length > 1`, invokes
   `reranker.rerank(query, passages)` and merges the score back
   into `semantic`, then recomputes hybrid score and re-sorts.
5. `LocalRerankerProvider.rerank()` at
   `packages/core/src/embedding/reranker.ts:29` runs the ONNX
   cross-encoder via transformers.js `AutoModelForSequenceClassification`.
   Returns logits as a `number[]`.

The wiring is correct in isolation. Problems:

- **The reranker is only wired into `fulcrum-core`'s `recallMemory`.**
  `fulcrum-memory`'s `recallMemory` never calls `getReranker()`
  (`rg getReranker packages/memory/`). So the "advanced" path
  doesn't rerank at all. Given the core path is what the CLI
  actually uses (see C-2), the reranker ships — but into the
  simpler path.

- **Reranker logits are used as raw scores.** `reranker.ts:41`
  returns `Array.from(logits.data)`. BGE-reranker-v2-m3 emits
  logits in a wide range (typically −10 to +10). The clamp at
  `memory.ts:346` — `Math.max(0, Math.min(1, rerankerScore))` —
  treats this as a probability and clamps. So a logit of −3.5
  becomes 0, and a logit of +7.2 becomes 1. Real rerankers apply
  a sigmoid to get `(0,1)` and *then* compare. The current clamp
  throws away the ordering in the `(−∞, 0)` band by collapsing
  everything to 0.
  - **Fix:** apply `1/(1+exp(-logit))` sigmoid before clamping.

- **Candidate pool too small.** See H-3.

- **Per-query tokenizer call with `text_pair` is correct** (line 33).
  Commit `3ee6431` fixed this recently. Good. But there's no batch
  size cap — a `limit=100` query would tokenise 200 passages in
  one call.

- **No reranker telemetry.** Nowhere is reranker p50 latency
  recorded, or candidate count, or rerank-vs-baseline relative
  order metrics.

Overall: the reranker is not the "imported but never called" kind
of bug. It's the "called on a 10-item pool, logit-clamped,
diluted by a 0.4 weight, inside the weaker recall path" kind of
bug. Less embarrassing, still measurably wrong.

---

## The §10.7 weighted formula — justified?

The formula (`packages/core/src/constants.ts:27`):

```
score = 0.4·semantic + 0.3·lexical + 0.2·recency + 0.1·confidence
```

R5 comparison:

- **§6.2 RRF:** `Σ 1/(k+rank_i)` — no normalisation, no weights,
  robust to incomparable scales. R5 §6.3: "RRF dominates in practice
  because it's robust to the fact that BM25 scores and cosine
  similarities live on different scales." The §10.7 formula mixes:
  - `semantic` from `1/(1+distance)` on L2 distance (memory.ts:316)
    — ≈ (0, 1] with median around 0.5 for sqlite-vec typical cosine
    L2 distances, non-linear, never 0 or 1 in practice.
  - `lexical` from `1/(1+abs(bm25_rank))` — ≈ (0, 1], sparse, most
    values ≤ 0.1 except the LIKE fallback anomaly at exactly 1.0.
  - `recency` from `exp(-ageDays/30)` — dense, smooth.
  - `confidence` from user input or 0.5.
  These live on different scales. The weighted sum treats them as
  if they do not. This is what RRF was invented to avoid.

- **Weights not validated.** No test case, no benchmark, no eval
  script references these weights. `rg MEMORY_RANK_WEIGHTS packages/`
  returns 2 hits: the definition and the use in `hybridScore`. The
  weights never appear in a test fixture or a config override.

- **§8.2 Park et al. formula:**
  `α·recency + β·importance + γ·relevance, α=β=γ=1`. Three channels,
  uniform weights, `relevance` = semantic. Simpler, equally
  unjustified, but at least matches the cited paper.

- **"§10.7" is a Fulcrum internal spec section.** The comments
  reference §10.7 but the *R5* audit contains no §10.7; it has
  §10 "Code-specific retrieval" with subsections 10.1–10.6. §10.7
  is an artifact of an earlier Fulcrum design doc. This is a
  citation drift warning: the code points at internal specs, the
  internal specs drift ahead of research, and nobody re-checks.

**Recommendation:** replace `hybridScore` with RRF over the first
stage, then multiply by a post-fusion decay:

```
rrf_score = 1/(60 + rank_fts) + 1/(60 + rank_dense) + 1/(60 + rank_repo_map)
final_score = rrf_score · freshness · (1 + 0.2 · importance)
```

Then cross-encoder rerank top-50, return top-k by rerank score
unchanged.

---

## Memory consolidation / decay gap

R5 §8 lays out three complementary loops:

1. **Decay:** scheduled job, `importance *= exp(-Δt/τ)`, soft-delete
   below floor. R5 §11.5 gives the pseudocode.
2. **Consolidation:** merge near-duplicate memories at write time
   (Mem0 §8.3) and episodic → semantic via reflection (Park et al.
   §8.5). Near-dup: cosine > 0.95 → merge. Reflection: periodic
   LLM summarisation of top-N memories → new semantic memory.
3. **Access boost:** every retrieval bumps `access_count` and/or
   `last_accessed_at`; long-unused memories age out faster.

Fulcrum state:

- Decay: **not implemented.** `freshness` column exists but is
  fixed at write time. Janitor doesn't touch memories.
- Consolidation: **exact-dedup only** (`dedup.ts:13`). Near-dup
  cosine check exists in `core/memory.ts:154` but only fires when
  the caller supplies an embedding, which no production caller
  does. Reflection loop: not implemented; `extractSemantic` is a
  stub.
- Access boost: **access_count is updated** on recall
  (`core/memory.ts:366`, `memory/recall.ts:91`). But access_count
  never feeds back into the ranking score — `computeImportance`
  uses it but `computeImportance` is not read by either recall
  function. Dead code path.

The combined effect: **memory in Fulcrum is append-only**. Never
merged, never decayed, never consolidated. Over months of agent
activity this will produce thousands of near-duplicate `tool_trace`
rows that all match the same FTS5 queries and crowd out older,
higher-signal memories.

**Fix:** see F5-ISSUE-06.

---

## Code search gap (no tree-sitter, no repo-map)

Consolidating the code-search-specific findings:

| R5 requirement | Fulcrum status |
|---|---|
| Tree-sitter chunker for 6+ languages | **Absent.** Regex for TS/JS only. |
| Symbol-level chunks with metadata | Partial. `symbol_path` captured from TS/JS regex only. |
| Cross-file symbol resolution | **Absent.** |
| Repo-map / PageRank over refs | **Absent.** |
| Code-specialized embedder | **Absent.** Config allows it, default is null. |
| NL→code query reformulation (HyDE) | **Absent.** |
| Stacked retrieval file→symbol→line | **Absent.** |
| Code-aware rerank (voyage-rerank-2 / similar) | BGE reranker works on code, but not code-tuned. |
| File-summary chunks | **Absent.** |

Fulcrum cannot, today, answer a query like *"where is the retry
logic in the worker?"* with anything better than a BM25 match on
the string "retry". For the "agent coding workflow" positioning
in the repo's README, this is disqualifying.

This is the section where "rebuild vs retrofit" becomes a live
question — see below.

---

## Issues to plan

### F5-ISSUE-01 — tree-sitter AST chunker for code (→ plan)

- **Scope:** add `web-tree-sitter` + wasm grammars for TS/JS,
  Python, Rust, Go, Java, C/C++. Build
  `packages/memory/src/chunkers/tree-sitter.ts` that runs `.scm`
  tag queries to emit `{symbol, kind, start_line, end_line, text,
  imports[], docstring?, callers[], callees[]}`. Fall back to
  sliding window for unsupported languages.
- **R5 citations:** §3, §4.
- **Dependencies:** `web-tree-sitter@0.22+`, grammar wasms. All
  Apache-2.0 / MIT.
- **Acceptance:** a fixture of 20 symbols across 6 languages is
  chunked correctly, one chunk per definition, line-exact.
  Regression on the existing regex chunker's JS/TS fixture is
  tolerated (different boundaries acceptable if they're correct).

### F5-ISSUE-02 — separate code embedder path (→ plan)

- **Scope:** add `vec_code_chunks` virtual table, default
  `config.embedding.code = {provider:'local', model:'jinaai/jina-code-embeddings-0.5B'}`,
  route `ingestFile` through `getCodeEmbedder()` for code and
  `getTextEmbedder()` for prose. Add a `route` on recall that
  picks embedder by `kind` or query classifier.
- **R5 citations:** §2, §2.5.
- **Dependencies:** ONNX version of jina-code-embeddings or an
  equivalent ORT export.
- **Acceptance:** code queries route to the code embedder; text
  queries route to text; recall harness shows ≥5% relative
  improvement on code-to-code retrieval.

### F5-ISSUE-03 — RRF hybrid fusion (→ plan)

- **Scope:** delete `MEMORY_RANK_WEIGHTS` and `hybridScore`, port
  `packages/memory/src/scoring.ts:rrfScore` into the production
  recall path. Post-fusion multiply by `freshness` and
  `1 + 0.2·importance`.
- **R5 citations:** §6.2, §6.6.
- **Acceptance:** retrieval harness (F5-ISSUE-08) shows
  recall@5 ≥ the previous formula's recall@5 on the fixture.

### F5-ISSUE-04 — Aider-style repo-map (→ plan)

- **Scope:** on ingest, extract `{definitions, references}` from
  the tree-sitter chunker (F5-ISSUE-01). Build a NetworkX-like
  directed multigraph in SQLite. Personalised PageRank keyed on
  "chat files" (the files currently referenced by an active agent
  run) and "mentioned identifiers" (extracted from the query).
  Render a markdown outline fitting a 1–4k token budget.
- **R5 citations:** §3.1 (Aider algorithm), §10.1.
- **Dependencies:** F5-ISSUE-01 must land first.
- **Acceptance:** on a 200-file TS fixture repo, repo-map output
  fits the budget and ranks the file containing a named symbol
  in the top-5.

### F5-ISSUE-05 — verified reranker wiring (→ plan)

- **Scope:**
  - Raise rerank candidate pool to 50 (configurable).
  - Apply sigmoid to logits before sorting.
  - Sort by rerank score directly, not the blended `hybridScore`.
  - Add a telemetry span per rerank with `candidates`, `latency_ms`,
    `p50_rerank_score`.
  - Add an eval script that measures recall@5 pre- and post-rerank.
- **R5 citations:** §5.1, §5.4, §5.7.
- **Acceptance:** pre-vs-post-rerank recall@5 delta is measurable
  and positive on the F5-ISSUE-08 harness.

### F5-ISSUE-06 — consolidation + decay jobs (→ plan)

- **Scope:**
  - Add `runMemoryDecayCycle` to janitor (hourly default, not
    per-minute). Updates `freshness` via exponential decay.
  - Add `runMemoryConsolidationCycle` (daily): for each workspace,
    find near-duplicate memories via cosine > 0.95 and merge them
    (keep the one with higher importance, transfer
    access_count/entity links).
  - Add `runMemoryReflectionCycle` (daily, requires LLM layer):
    sample top-20 memories by `computeImportance()` in the last
    24h; LLM-summarise into one or more new semantic memories;
    write back with `kind='summary'`, `importance=0.9`.
  - Require importance floor ≥ 0.3 at write for automatic
    memories.
- **R5 citations:** §8.2, §8.5, §11.3, §11.5.
- **Acceptance:** over a simulated 100-memory workload, after 30
  days of decay, low-importance memories are purged and
  `last_accessed_at` is the dominant ordering.

### F5-ISSUE-07 — ingestion quality gates (→ plan)

- **Scope:** add a `validateMemoryForWrite` pass in `write.ts`:
  length bounds (≥ 12 chars, ≤ 8k chars), basic PII redaction
  (email / phone / known key formats), near-duplicate cosine check
  (requires F5-ISSUE-03 so embeddings are reliably available),
  importance floor.
- **R5 citations:** §11.3.
- **Acceptance:** 1k-fuzz test of malformed memories is rejected
  with clear error codes.

### F5-ISSUE-08 — retrieval eval harness (→ plan)

- **Scope:** create `packages/memory/src/tests/recall-harness/`
  with a seed corpus of ~50 memories and ~30 queries, each query
  annotated with expected top-1 / top-5 memory IDs. `bun run
  test:recall` prints `recall@5`, `nDCG@5`, and p50/p95 latency.
  Run on every PR that touches `packages/{core,memory}/src/**`.
- **R5 citations:** §12, §13.2.
- **Acceptance:** harness runs in < 30s on CI, emits a
  deterministic JSON report, fails CI if recall@5 drops by > 10%.

### F5-ISSUE-09 — scope composition in recall (→ plan)

- **Scope:** the core recall WHERE builder emits a disjunction
  over `(workspace_id, project_id, task_id)` tuples, covering
  `task ⊇ file ⊇ project ⊇ global`. Per-scope bonus applied in
  post-RRF scoring so task-scope wins ties. Write a test case
  for the exact scenario in C-5.
- **R5 citations:** §9.2, §13.1 MUST ("Scope enforcement").
- **Acceptance:** recall from task scope returns project- and
  global-scoped memories too, with task-scoped memories tied at
  equal RRF rank beating them.

### F5-ISSUE-10 — consolidate the two `writeMemory` / `recallMemory`
implementations (→ plan)

- **Scope:** delete `packages/core/src/memory.ts`; re-export
  `fulcrum-memory` versions from `fulcrum-core`. Migrate CLI
  and monitor imports. Reconcile the return type (`Memory[]` vs
  `CompactMemory[] | FullMemory[]`) with a migration note; bump
  the MCP tool schema accordingly.
- **R5 citations:** §13.1 MUST (single source of truth).
- **Acceptance:** `rg 'recallMemory' packages/ | grep -v tests`
  shows one producer and one consumer path.

### F5-ISSUE-11 — Kuzu memory-node creation in the write path (→ plan)

- **Scope:** `write.ts` calls `upsertMemoryToKuzu` before
  `runExtractionPipeline`. Remove the silent `.catch(() => {})`
  on the edge creation paths in `extractors/pipeline.ts` — log
  extraction failures.
- **R5 citations:** §7.3 (temporal graph append-only).
- **Acceptance:** a freshly written memory has a Memory node and
  its MENTIONS edges in Kuzu within 1s of the write returning.

### F5-ISSUE-12 — instruction prefixes + Matryoshka truncation (→ plan)

- **Scope:** extend `EmbeddingProvider.embed()` with
  `(text, {role: 'query'|'document', truncateTo?: number})`.
  Default Qwen3 prefix for queries:
  `"Instruct: Given a natural language query, retrieve relevant passages.\nQuery: "`.
  Add `storeDimensions` to config, default 1024.
- **R5 citations:** §1.3.
- **Acceptance:** reindex is a no-op when `storeDimensions` is
  unchanged; recall@5 on the harness improves.

### F5-ISSUE-13 — single retrieval telemetry span (→ plan)

- **Scope:** wrap `recallMemory` in a telemetry span with
  attributes `fts_hits`, `vec_hits`, `fused_count`, `rerank_count`,
  `p50_ms`, `p95_ms`, `mode`, `scope`. Emit per-query so the
  monitor dashboards can show retrieval latency.
- **R5 citations:** §12.3 latency targets.
- **Acceptance:** a recall call is visible in monitor metrics
  with all fields populated.

### F5-ISSUE-14 — fix the `recall_memory` MCP tool description (→ plan)

- **Scope:** once C-1 is fixed, the description at
  `cli/src/index.ts:675` can stay. Until then, amend it to
  "lexical + recency recall, optionally reranked by cross-encoder;
  semantic recall is not yet populated".
- **R5 citations:** truthfulness of user-facing tool surfaces.
- **Acceptance:** MCP tool descriptor matches what the code does.

### F5-ISSUE-15 — reranker sigmoid + batching (→ plan)

- **Scope:** `LocalRerankerProvider.rerank` applies
  `1/(1+exp(-x))` to each logit before returning; accept a
  `batchSize` option and loop in batches of 32.
- **R5 citations:** §5.4.
- **Acceptance:** rerank monotonic in score for a canonical
  synthetic fixture.

---

## Rebuild vs retrofit decision

The question from the audit brief: *"Rebuilding the memory layer
around the R5-recommended stack is on the table."*

### Option A — Retrofit

Keep `fulcrum-memory` and the Kuzu integration; port everything
to `fulcrum-core`'s production path. Fix F5-ISSUE-01 through -15
against the existing schema. Estimated effort: each issue is 0.5–5
days, most in the 1–3 day band. Net ≈ 20–40 engineer-days.

Retrofit wins on:
- Preserves the L0 markdown vault (already useful for git-backed
  memory, matches R5 §9 audit-log expectations).
- Preserves Kuzu HNSW + entity store scaffolding, which is
  good-quality code — it just needs to be called.
- Consolidation into `fulcrum-memory` is one of the 15 issues; not
  a full rebuild.

Retrofit loses on:
- Tree-sitter chunker, repo-map, code embedder path, eval harness,
  decay+consolidation jobs are all greenfield additions. 60% of the
  effort is new code, not refactoring.
- The "two implementations" dead weight in `fulcrum-core/memory.ts`
  is technical debt that deletes cleanly but requires a migration
  path for downstream consumers.
- Retains the `MemoryKind`+16-variants taxonomy which has no
  retrieval-time meaning.

### Option B — Rebuild

Delete `fulcrum-core/memory.ts` and `fulcrum-memory/` entirely.
Create a single `fulcrum-recall` package with:

- **Storage:** SQLite (L1) + `sqlite-vec` (dense, per-index tables)
  + FTS5 (lexical) + optional Kuzu (graph). L0 vault is optional
  and lives under `fulcrum-recall/vault`.
- **Indexes:** one per content class
  - `vec_text` — prose memories, Qwen3 1024-dim
  - `vec_code_chunks` — code chunks, jina-code 768-dim
  - `vec_summaries` — reflection outputs, 1024-dim
- **Chunkers:** `chunkers/prose.ts` (paragraph recursive),
  `chunkers/code.ts` (tree-sitter), `chunkers/markdown.ts`
  (heading-level recursive). Dispatched by file type.
- **Retrieval:** `hybridSearch(query, filters)` → RRF over
  `{FTS5, vec_text, vec_code_chunks, repoMap}`, then BGE rerank,
  then MMR diversify. Explicit `mode: 'compact'|'full'`.
- **Repo-map:** computed on demand from tree-sitter tags +
  SQLite-backed symbol graph + personalised PageRank.
- **Memory layer:** episodic/semantic/procedural distinction at
  the type level; decay + reflection + near-dup consolidation
  baked into the write and janitor paths.
- **Eval harness:** shipped with the package. CI gate.

Rebuild wins on:
- No deprecation dance, no "two implementations" debt.
- Forces the `episodic/semantic/procedural` taxonomy up front.
- Single package boundary for `write_memory` / `recall_memory`
  MCP tools.
- Opportunity to get the API types right in one shot (compact vs
  full, scope composition, telemetry spans).

Rebuild loses on:
- Higher upfront cost. Rough estimate 40–60 engineer-days (twice
  retrofit).
- Breaks every downstream caller at once instead of incrementally.
- Higher risk of "boiling the ocean" — an experienced team can
  land 15 issues sequentially and ship each one; a rebuild has
  to ship an MVP before it's usable.

### Recommendation

**Retrofit, but in this order:**

1. **Land F5-ISSUE-10 first.** Consolidate the two
   `recallMemory`/`writeMemory` implementations into
   `fulcrum-memory`, re-export from `fulcrum-core`. This is the
   single highest-leverage change — it unblocks every other issue
   because all improvements land in one code path.
2. **Then F5-ISSUE-11** (Kuzu memory-node creation). Fixes the
   silently-broken extraction pipeline.
3. **Then F5-ISSUE-08** (eval harness). Before touching any other
   retrieval code, we need a metric. Otherwise we cannot claim
   improvement.
4. **Then C-1 / F5-ISSUE-03** (populate `vec_memories`, switch to
   RRF). This is the largest single quality win; the harness from
   (3) will measure it.
5. **Then F5-ISSUE-09** (scope composition), F5-ISSUE-05 (reranker
   wiring), F5-ISSUE-12 (instruction prefixes).
6. **Then F5-ISSUE-01 / F5-ISSUE-02 / F5-ISSUE-04** (tree-sitter,
   code embedder, repo-map). The code-search gap is the biggest
   user-visible quality gap, but it depends on the foundation in
   steps 1–5 to be measurable.
7. **Finally F5-ISSUE-06 / F5-ISSUE-07** (decay, consolidation,
   quality gates, reflection). These become critical around the
   point when Fulcrum has a live user running it for more than a
   few days — ship before that point, not after.

Rebuild is the right move only if step 1 turns out to be harder
than expected. If reconciling `fulcrum-core`'s thin `Memory`
return type with `fulcrum-memory`'s `CompactMemory`/`FullMemory`
breaks more than 5 call sites badly, that's the signal to
re-evaluate.

---

## Tangential: what C1/C2 already know and we should cross-reference

- **C1 §2.2** is the memory package inventory — confirm the
  `fulcrum-memory` exports list at `packages/memory/src/index.ts`
  and the two-package split. F5 uses this to make the "two
  implementations" argument.
- **C2 §8** is the memory write pipeline — cross-referenced at
  `docs/audit/codebase/c2-user-surfaces.md:1420+`, which already
  flags that "vec_memories / vec_chunks virtual tables are wrapped
  in try/catch". C2 notes the *optional* nature; F5 adds that
  they are also *never populated*.
- **R3 workspace isolation bug** fixed in commit `18ff7ef` — cited
  in the R5 standards checklist §13.1. Fulcrum already has the
  test case for that; F5-ISSUE-09 extends the test set to cover
  scope composition.

---

## References

- R5 audit: `docs/audit/research/r5-rag-memory.md` (2026-04-14)
- C1 inventory: `docs/audit/codebase/c1-inventory.md`
- C2 user surfaces: `docs/audit/codebase/c2-user-surfaces.md`
- Fulcrum memory code:
  - `packages/core/src/memory.ts`
  - `packages/core/src/embedding/{local,registry,reranker,types}.ts`
  - `packages/core/src/db/migrations.ts` (vec_memories, memories_fts)
  - `packages/core/src/constants.ts` (`MEMORY_RANK_WEIGHTS`)
  - `packages/core/src/config.ts` (`DEFAULT_TEXT_EMBEDDING`,
    `DEFAULT_RERANKER`)
  - `packages/core/src/types.ts` (`MemoryKind`, `MemoryScope`,
    `EmbeddingProviderConfig`)
  - `packages/core/src/janitor.ts`
  - `packages/memory/src/{recall,write,ingest,dedup,scoring,graph}.ts`
  - `packages/memory/src/extractors/{structured,semantic,pipeline}.ts`
  - `packages/memory/src/kuzu/{query,upsert,client,entity-store}.ts`
  - `packages/memory/src/setup/rebuild.ts`
  - `packages/cli/src/index.ts` (`recall_memory`/`write_memory` MCP
    tools, `warmEmbedding`)
  - `packages/monitor/src/server.ts`
- External (via R5 §15):
  - Aider repo-map — https://aider.chat/docs/repomap.html
  - Qwen3 Embedding — https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
  - BGE-reranker-v2-m3 — https://huggingface.co/BAAI/bge-reranker-v2-m3
  - BGE-M3 paper — https://arxiv.org/abs/2402.03216
  - Jina code embeddings — https://jina.ai/news/jina-code-embeddings-sota-code-retrieval-at-0-5b-and-1-5b/
  - RRF paper (Cormack et al. 2009) —
    https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
  - MemGPT / Letta — https://arxiv.org/abs/2310.08560
  - Graphiti / Zep — https://arxiv.org/abs/2501.13956
  - Generative Agents — https://arxiv.org/abs/2304.03442
  - Tree-sitter queries — https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries
  - Continue.dev (reference hybrid TS impl) — https://docs.continue.dev/
  - SWE-bench retrieval — https://www.swebench.com/
  - sqlite-vec — https://github.com/asg017/sqlite-vec
