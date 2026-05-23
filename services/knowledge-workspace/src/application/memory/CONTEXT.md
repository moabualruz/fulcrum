# Memory

Sub-area of **Knowledge Workspace** that owns capture, ranking, and packaging of **Memories** for agent runs: heuristic and LLM extraction, hybrid retrieval, scoped promotion, and bundle assembly under a token budget.

## Language

**HeuristicExtractor**:
A deterministic, regex-driven extractor that emits `source: "heuristic"` **Memories** for decisions, blockers, file refs, headings, and links from a transcript or doc body.
_Avoid_: Parser, scanner, regex matcher.

**LlmExtractionJob**:
A feature-flagged (`memory-llm-extract`), retry-bounded extractor that calls the inference sidecar `extract_facts` and writes `source: "llm"` **Memories** after de-duplication.
_Avoid_: AI extractor, fact pipeline, LLM job.

**MemoryDigestJob**:
A feature-flagged (`report-llm-narration`) summarizer that calls the sidecar `summarize` over a project's recent **Memories** and writes the result as a `DocType: note` **Document**.
_Avoid_: Weekly recap, narration, summary job.

**Promotion**:
The act of flipping a project-scoped **Memory** to `global: true` while preserving its original `projectId` for audit.
_Avoid_: Globalize, publish, share.

**ProjectOverGlobalTier**:
The deterministic tier rule that ranks project-scoped **Memories** above global ones for same-project queries, before applying any score within a tier.
_Avoid_: Project priority, scope bias.

**ImportanceBoost**:
The additive score component derived from a **Memory**'s `Importance` (`high: 1`, `medium: 0`, `low: 0`) when ranking.
_Avoid_: Importance weight (used inside `MemoryService.search` for its 3x/2x/1x multiplier), priority score.

**RecencyBoost**:
The exponentially decayed score component (30-day half-life) added to a **Memory**'s rank based on `createdAt`.
_Avoid_: Freshness, age bonus, time decay.

**HybridScore**:
The combined `0.6 * normalize(BM25) + 0.4 * cosine(queryEmbedding, memoryEmbedding)` ranking used when the `embeddings` flag is on and the sidecar returns a query vector.
_Avoid_: Blended score, vector + text rank.

**MemoryRetriever**:
The application-layer entry point that chooses between FTS-only and hybrid ranking based on the `embeddings` flag and sidecar availability, and returns `Memory[]` with optional cached `queryEmbedding`.
_Avoid_: Retriever, search service.

**BeforeRunContextHook**:
The `before_run` hook that delegates to the **ContextAssembler**, writes the resulting **ContextBundle** to `.fulcrum/context.json`, and falls back to an empty error bundle on failure.
_Avoid_: Pre-run injector, prep step.

**AfterRunMemoryHook**:
The `after_run` hook that runs the **HeuristicExtractor** over a transcript and idempotently writes new **Memories** plus a `MemoryLink` of `targetKind: "agent_run"`.
_Avoid_: Post-run capture, run hook.

**MemoryLink**:
A typed edge from a **Memory** to its origin entity (`agent_run`, doc, task, artifact) created alongside extraction so the same body is not re-linked.
_Avoid_: Backref, attachment, association.

**SliceBudget**:
A fractional share of `TOTAL_TOKEN_BUDGET` (8000) allotted to one **ContextBundle** slice (`memories: 0.25`, `linkedDocs: 0.20`, `recentRuns: 0.35`, `repoState: 0.10`, `skillPrompts: 0.10`).
_Avoid_: Quota, allocation, weight.

**GreedyFill**:
The slice-fill algorithm that adds candidates in input order until the next item would exceed the **SliceBudget**, then stops.
_Avoid_: Knapsack, packer, truncation.

## Relationships

- A **HeuristicExtractor** emits **Memory** candidates with `source: "heuristic"`; an **LlmExtractionJob** emits candidates with `source: "llm"`; both run after the same triggers and produce disjoint rows after dedup.
- An **AfterRunMemoryHook** invokes the **HeuristicExtractor** once per run and creates one **MemoryLink** per (Memory, run) pair.
- A **BeforeRunContextHook** invokes the **ContextAssembler** once per run and writes exactly one **ContextBundle** to disk.
- A **ContextBundle** has exactly five slices, each governed by its own **SliceBudget** and filled by **GreedyFill**.
- A **MemoryRetriever** call returns memories ranked by FTS-only **ImportanceBoost** + **RecencyBoost**, or by **HybridScore** + **ImportanceBoost** + **RecencyBoost** when embeddings are on.
- A **Promotion** mutates one **Memory** in place; the **ProjectOverGlobalTier** then ranks it below project-scoped peers for the originating project's queries.
- A **MemoryDigestJob** reads many **Memories** in a window and writes exactly one **Document** of `DocType: note`.

## Example dialogue

> **Dev:** "If the `embeddings` flag is on but the sidecar is down, do we error or fall back?"
> **Domain expert:** "Fall back. **MemoryRetriever** calls `embedQuerySafe`; if it returns null, we log a warning and take the FTS-only path with **ImportanceBoost** and **RecencyBoost**. The user never sees a failure."
> **Dev:** "And inside a slice — say `recentRuns` — what stops a single fat run from eating the whole bundle?"
> **Domain expert:** "**GreedyFill** checks the next item's estimated tokens against the remaining **SliceBudget** and breaks before overflow. The slice can underfill but never overflows."

## Flagged ambiguities

- **"Importance weight" vs "ImportanceBoost"** — `MemoryService.search` uses a multiplicative weight (`high: 3`, `medium: 2`, `low: 1`) for tiered sort; the retriever uses an additive **ImportanceBoost** (`high: 1`, `medium: 0`, `low: 0`). Resolution: name the multiplicative form "importance weight" and reserve **ImportanceBoost** for the additive retriever component.
- **"Source"** — overloaded between `MemorySource` (`heuristic | llm | manual`) on a **Memory** row and **SourceRef** (the provenance pointer defined in the parent context). Resolution: `MemorySource` names the producer, **SourceRef** names the origin entity.
- **"Bundle"** — `ContextBundle` returned by **ContextBundleService** and the bundle written by **BeforeRunContextHook** are the same shape but assembled by different services (`ContextBundleService` vs `ContextAssembler`). Resolution: call the produced artifact **ContextBundle**; name the producer explicitly when both could apply.
- **"Dedup"** — **LlmExtractionJob** uses `pg_trgm similarity() > 0.85` (or exact-match fallback); **AfterRunMemoryHook** uses exact `(org, kind, body, source)` match. Resolution: both are dedup, but they are not interchangeable — name the strategy when it matters.
