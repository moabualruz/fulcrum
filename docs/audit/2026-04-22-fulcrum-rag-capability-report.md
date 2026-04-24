# Fulcrum RAG Capability Report

Date: 2026-04-22
Scope: Fulcrum memory, code search, embeddings, reranking, graph recall, reset/rebuild operations, and multi-agent ingestion.

This report reflects the current repo plus live reset/reindex behavior observed on `/home/mkh/workspace/pi-stack-plan`.

## Executive Rating

Overall: **6.5 / 10**

| Area | Current | Target |
|---|---:|---:|
| Architecture intent | 8.5 | 10 |
| Text memory search | 7.0 | 10 |
| Code search | 7.0 | 10 |
| Provenance and auditability | 8.0 | 10 |
| Embeddings and vector operations | 5.0 | 10 |
| Reranking | 6.5 | 10 |
| Reset, rebuild, and index lifecycle | 4.0 | 10 |
| Multi-agent ingestion | 7.5 | 10 |
| Production reliability | 5.0 | 10 |
| Observability and evaluation | 5.0 | 10 |

Short version: Fulcrum has the right RAG architecture. It is not yet operationally disciplined enough. The design can reach 10/10, but only after index lifecycle, embedding durability, evaluation gates, and single-path invariants are fixed.

## What Is Strong

1. **Layered memory model is correct.**
   L0 raw vault, L1 curated/indexed memory, and L2 vector/graph indexes are the right separation. Raw evidence stays canonical. Search layers are derived.

2. **Local-first design is strong.**
   SQLite, vault files, sqlite-vec, Kuzu, and local ONNX models match the project goal. Remote providers and Ollama can remain configurable choices without becoming hidden fallback.

3. **Code index stores useful attribution.**
   `code_chunks` stores `file_path`, `file_id`, `start_line`, `end_line`, `symbol_path`, `language`, `content`, `content_hash`, and optional `embedding`. `search_code` returns path plus line range, not just file path.

4. **Agent-host coverage is broad.**
   Integration work covers Codex, Claude, Gemini, opencode, Pi, Copilot, and related project-local artifacts. This is uncommon and valuable.

5. **Hybrid retrieval direction is right.**
   The intended stack includes FTS, vectors, reranking, confidence, supersession, and graph expansion. Those are the right ingredients.

6. **Provenance model has the right shape.**
   L1 pages can point back to L0 raw sources through frontmatter sources and inline `[[raw/...]]` wikilinks. This is the foundation for auditable memory.

7. **GPU-first model loading is improving.**
   Local embedding and reranker providers now try CUDA before lower-tier backends in auto mode, and explicit CUDA should be treated as a hard requirement, not silently ignored.

## Critical Findings

### F1. Reset/Rebuild Is Not One Authoritative Operation

Observed behavior:
- A vault rebuild alone repopulated L1 but left prior code index state unless manually cleared.
- A file reindex through one path created `code_chunks` without `code_files`.
- The PCI sync path created `code_files` plus `code_chunks`, but parse-error files left zero-chunk rows until cleaned.
- `memory rebuild --help` can trigger rebuild behavior instead of help in some command paths.

Impact:
- Operators cannot trust whether an index is fresh, partial, or mixed.
- Agents may search stale chunks or miss file metadata.
- "Reset" requires manual DB knowledge.

10/10 requirement:
- One command owns derived-index lifecycle:
  `fulcrum memory reset --derived --rebuild --code --embed`
- It must clear derived rows, rebuild L0 source rows, rebuild L1, rebuild code files/chunks, rebuild FTS, rebuild vectors, verify counts, and write a machine-readable report.

### F2. Embedding Pipeline Is Not Robust Enough

Observed behavior:
- Full embedding reindex is running, but CUDA OOM occurs on large internal batches.
- Split retry keeps progress alive, but it is reactive.
- There is no durable progress ledger for full corpus embedding.
- Failed rows are logged but not stored in a first-class failure table.
- Memory embedding and code embedding are separate commands with different selection rules.

Impact:
- Large corpora require babysitting.
- GPU OOM can cause slow split storms.
- Operators cannot easily answer "which rows are embedded, failed, skipped, stale, or using old model X?"

10/10 requirement:
- Embedding jobs must be resumable, durable, and model-aware.
- Every vector row must record provider, model, device, dimensions, content hash, embedded_at, and error state.
- No silent drop. No truncation without explicit chunk provenance.
- If content exceeds model limits, split at the indexing layer with stable chunk IDs and line/source provenance. Do not pretend a partial document was fully embedded.

### F3. Memory Reindex-L2 Targets Only v3 Pages

Observed behavior:
- `fulcrum memory reindex-l2 --pages` scans `memories WHERE schema_version >= 3`.
- The vault rebuild produced many rows with `schema_version < 3`.
- Result: page vector reindex would embed zero memory rows after this rebuild.

Impact:
- Operator thinks "reindex L2 pages" covers memory, but it may cover nothing.
- Vector recall can be empty while L1 search appears healthy.

10/10 requirement:
- Either rebuild must restore correct v3 schema values, or L2 reindex must support all memory rows intentionally.
- CLI must print exact scanned counts before work starts and fail loudly when scope is unexpectedly zero.

### F4. Two Code Index Paths Behave Differently

Observed behavior:
- `ingestProject()` fills `code_chunks` and writes memory rows.
- PCI `syncFile()` fills `code_files`, then fills `code_chunks`, and updates `file_id`.
- The two paths do not produce identical state.

Impact:
- Search attribution and file-level status diverge by command path.
- Reindex quality depends on which API was used.

10/10 requirement:
- One code indexing engine.
- Batch project indexing and watch-driven incremental indexing must call the same file-level primitive.
- Invariant: every `code_chunks.file_id` resolves to a `code_files.file_id`, unless explicitly legacy and reported.

### F5. Reranking Exists But Needs Runtime Proof

Observed behavior:
- Reranker is wired into v3 search and configured for GPU-first local execution.
- OOM or provider fallback can push reranker to CPU.
- Logs show fallback, but search results do not expose provider/device/fallback details.

Impact:
- Operators cannot tell if ranking quality came from reranker, vector search, FTS, or fallback.
- GPU availability does not mean GPU actually served the request.

10/10 requirement:
- Every recall response with `--explain` includes retrieval stages, stage scores, reranker provider/model/device, fallback reason, and latency.
- Explicit device config must fail closed.
- Auto device config may fallback, but must expose fallback.

### F6. Provenance Is Promising But Not Enforced Everywhere

Observed behavior:
- L0 raw source index can be rebuilt from raw vault files.
- L1 curated memories can cite L0.
- Legacy/v2 style memories and code chunk memories may not carry full L0 provenance.

Impact:
- Some recalled claims are auditable, some are just indexed text.
- Agents cannot uniformly answer "what raw evidence supports this result?"

10/10 requirement:
- Every memory result has a provenance class:
  `raw-backed`, `curated-backed`, `code-backed`, `legacy-unbacked`, or `generated`.
- Recall output must expose source links and confidence in a consistent shape.
- Lint must fail if a curated page has broken `sources[]` or unresolved inline `raw` links.

### F7. Graph Layer Is Underused

Observed behavior:
- Kuzu graph support exists.
- Graph entities, edges, and episodes were zero after reset in the observed DB state.
- Code import graph projection exists in parts but is not yet a trusted retrieval backbone.

Impact:
- Fulcrum cannot yet reliably answer relationship questions like "what files depend on X?", "which decisions changed this module?", or "which sessions caused this invariant?"

10/10 requirement:
- Graph build is part of reset/rebuild.
- Graph queries are first-class in recall explanation.
- Code symbols, imports, task decisions, errors, and memory supersession edges are materialized and tested.

### F8. Evaluation Gates Are Too Weak

Observed behavior:
- Tests exist for packages and isolated retrieval behavior.
- There is no always-on corpus eval proving recall quality after reset, rebuild, embedding, or reranker changes.

Impact:
- RAG can regress while tests pass.
- "It indexed" gets confused with "it retrieves the right thing."

10/10 requirement:
- A golden eval set covers memory recall, code search, hybrid recall, reranking, provenance trace, and reset/rebuild invariants.
- CI gate fails on recall regression.
- Operator command runs local eval after every full reindex.

### F9. Observability Is Below Operator Needs

Observed gaps:
- No single status surface shows raw/L1/code/vector coverage by model and freshness.
- Long-running embedding progress is log-driven.
- OOM, fallback, split retries, and failed rows are not first-class DB facts.

Impact:
- Operators must inspect logs and write SQL.
- Agents cannot reliably decide what work remains.

10/10 requirement:
- `fulcrum memory doctor` reports:
  - L0 row count vs raw vault files
  - L1 count vs curated/operational vault files
  - FTS row parity
  - code_files/code_chunks parity
  - vector coverage by table/model/provider/device
  - failed embeddings by reason
  - stale embeddings by content_hash/model mismatch
  - graph node/edge coverage

### F10. CLI Safety Needs Tightening

Observed behavior:
- Some commands have surprising behavior around help or scope.
- Reset/reindex requires hidden knowledge of command interactions.
- Background embedding requires careful process handling.

Impact:
- Human and agent operators make wrong assumptions.
- Recovery becomes trial-and-error.

10/10 requirement:
- All destructive or expensive commands have dry-run, plan, execute, and report modes.
- All commands print exact scope before mutation.
- No help command mutates state.
- Background jobs have first-class job IDs, status, logs, cancellation, and resume.

## Target 10/10 Architecture

### Principle 1: Raw Is Canonical, Everything Else Derived

All search state must be reproducible from:
- vault raw files
- vault curated files
- project files
- explicit config

Derived state includes:
- `l0_sources`
- `memories`
- FTS tables
- `code_files`
- `code_chunks`
- vector tables
- graph tables
- eval reports

Reset must never require manual SQL.

### Principle 2: One Indexing Path Per Domain

Memory:
- one rebuild path for L0/L1
- one embedding path for memory rows

Code:
- one file-level indexing primitive
- batch indexing and watcher indexing call the same primitive

No duplicate "almost same" paths.

### Principle 3: Vector Coverage Is a Contract

For every searchable row, Fulcrum must know:
- should it be embedded?
- is it embedded?
- with which model?
- against which content hash?
- on which device?
- when?
- if failed, why?

No vector row should be just a blob with no operational metadata.

### Principle 4: GPU-First Means Verified GPU Use

Auto mode:
- try CUDA
- try WebGPU if supported
- fallback CPU only with visible reason

Explicit mode:
- `cuda` means CUDA or fail
- `cpu` means CPU by choice
- `ollama` means configured provider choice, not fallback

Recall and embedding reports must show actual device used.

### Principle 5: Retrieval Must Explain Itself

Every result should be explainable:
- FTS rank
- vector rank
- reranker score
- graph boost
- freshness/confidence
- supersession state
- provenance source
- file path and line range for code

Agents need this to know whether to trust a result.

### Principle 6: Eval Before Trust

Fulcrum needs a standing eval suite:
- known memory query -> expected memory IDs
- known code query -> expected file/line chunks
- stale claim query -> superseded result excluded
- provenance query -> raw source returned
- reranker query -> lexical distractor demoted
- reset/rebuild -> counts and parity restored

No RAG change should merge without eval.

## Concrete Improvement Plan

### P0 - Make Reset/Rebuild Real

Deliver:
- `fulcrum memory reset --derived`
- `fulcrum memory rebuild --all`
- `fulcrum memory rebuild --all --embed`
- final JSON report

Acceptance:
- Clears all derived memory/code/vector/graph rows.
- Rebuilds L0 from raw vault files.
- Rebuilds L1 from curated/operational vault files.
- Rebuilds code_files and code_chunks through PCI primitive.
- Rebuilds FTS.
- Optionally rebuilds vectors and graph.
- Fails if parity checks fail.

### P0 - Fix L2 Reindex Scope

Deliver:
- `fulcrum memory reindex-l2 --memories`
- `fulcrum memory reindex-l2 --l1-pages`
- `fulcrum memory reindex-l2 --code`
- preflight counts before any embedding starts

Acceptance:
- `--memories` embeds all memory rows intended for recall.
- `--l1-pages` embeds only true v3 pages.
- Zero scan count is a warning or failure unless `--allow-empty`.

### P0 - Add Embedding Job Ledger

Tables:
- `embedding_jobs`
- `embedding_job_items`
- `embedding_models`

Track:
- row ID
- source table
- content hash
- model/provider/device
- status: pending, running, embedded, failed, skipped
- error type/message
- attempts
- started/finished timestamps

Acceptance:
- Job can resume.
- Job can be cancelled.
- Job can be inspected.
- Failed rows can be retried only.

### P1 - Unify Code Indexing

Deliver:
- `indexProjectFiles()` uses `syncFile()` or shared primitive.
- Remove direct path that creates chunks without files.

Acceptance:
- Every code chunk has file_id.
- `code_files.chunks_count` matches actual chunk count.
- Parse-error files do not leave indexed rows unless explicitly marked failed.

### P1 - Add Vector Metadata

Deliver:
- metadata table keyed by `memory_id` / `chunk_id`
- model and content hash stored separately from vector blob

Acceptance:
- Can query stale vectors after model swap.
- Can query vectors created on CPU vs CUDA.
- Can prove no mixed-model index is active unless explicitly allowed.

### P1 - Add Retrieval Explain Contract

Deliver:
- stable explain schema for memory and code recall
- include stage ranks/scores/devices/provenance

Acceptance:
- `--explain` output is machine-parseable.
- Tests assert stage fields exist.

### P1 - Build Golden RAG Eval

Deliver:
- small checked-in fixture corpus
- eval command
- CI gate for retrieval changes

Acceptance:
- FTS, vector, reranker, graph, and provenance each have at least one regression test.
- Reset/rebuild test proves index parity from empty DB.

### P2 - Graph Recall Becomes First-Class

Deliver:
- graph rebuild command
- graph coverage stats
- graph expansion in explain output

Acceptance:
- Relationship queries return better results than FTS alone.
- Code imports, symbols, tasks, decisions, and supersession edges are queryable.

### P2 - Operator UX

Deliver:
- `fulcrum memory doctor`
- `fulcrum jobs list/status/cancel`
- monitor page for memory/index coverage

Acceptance:
- No manual SQL needed to know health.
- All long-running work has status and logs.

## Final 10/10 Definition

Fulcrum RAG reaches 10/10 when all are true:

1. Fresh DB can be rebuilt from vault and project files with one command.
2. Rebuild report proves row parity across L0, L1, FTS, code, vectors, and graph.
3. Embedding jobs are resumable, inspectable, and model/device/version aware.
4. GPU-first execution is verified, not assumed.
5. Recall output explains retrieval stages and provenance.
6. Code results always include path plus line range and stable file identity.
7. Every curated claim can trace to raw evidence or is marked as legacy/unbacked.
8. Reranker is active by default and reports actual model/device/fallback.
9. Golden evals guard quality, not just command success.
10. Operators can reset, rebuild, embed, diagnose, and recover without manual DB surgery.

## Current Recommendation

Do not add new RAG features first. Fix lifecycle.

Priority order:
1. Authoritative reset/rebuild command.
2. Embedding job ledger and resumability.
3. L2 reindex scope fix.
4. Unified code indexing path.
5. Retrieval explain schema.
6. Golden eval suite.

After those land, Fulcrum's existing architecture can support a 9+/10 RAG system. Without them, feature additions will keep compounding operational ambiguity.
