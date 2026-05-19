# Memory Retrieval

Sub-area of **Memory** that owns the pure ranking math and the embedding sidecar gateway used by the **MemoryRetriever**: BM25 text scoring, cosine vector scoring, hybrid blending, and dimension-checked query embeddings.

## Language

**Bm25TextRank**:
The raw Okapi BM25 score (`k1=1.5`, `b=0.75`) computed from query and document token frequencies over the candidate set.
_Avoid_: TF-IDF score, FTS score, text rank.

**NormalizedBm25**:
`Bm25TextRank / max(Bm25TextRank)` within the current candidate set, returning `0` when the max is `0`.
_Avoid_: Scaled BM25, relative text score.

**CosineSimilarity**:
`dot(a, b) / (|a| * |b|)` between a query embedding and a candidate **Memory** embedding, returning `0` when either vector is zero-length.
_Avoid_: Vector similarity, embedding distance.

**FtsWeight**:
The `0.3` coefficient applied to **NormalizedBm25** inside `hybridScore` when `useEmbeddings` is true.
_Avoid_: BM25 weight, text weight.

**CosineWeight**:
The `0.7` coefficient applied to **CosineSimilarity** inside `hybridScore` when `useEmbeddings` is true.
_Avoid_: Vector weight, embedding weight.

**HybridBase**:
The pre-boost combined score `FtsWeight * NormalizedBm25 + CosineWeight * CosineSimilarity`, distinct from the final **HybridScore** which also adds **RecencyBoost** and **ImportanceBoost**.
_Avoid_: Hybrid score (reserved for the parent-context final rank), blended base.

**RankTiebreaker**:
The deterministic ordering applied after `score` ties: `textRank` (or `hybridBase`), then **RecencyBoost**, **ImportanceBoost**, `createdAt` desc, `id` asc.
_Avoid_: Sort stabilizer, secondary key.

**SidecarEmbedClient**:
The `embedQuerySafe` HTTP client that POSTs to `FULCRUM_SIDECAR_URL/embed` with a 5 s `AbortController` timeout and returns `number[] | null` (never throws).
_Avoid_: Embedder, sidecar caller.

**EmbeddingDimensionAssertion**:
The fail-closed check (`assertEmbeddingDimension`, default 384) applied to both the sidecar response and every candidate embedding before hybrid ranking.
_Avoid_: Dimension check, vector length guard.

## Relationships

- A **SidecarEmbedClient** call produces a query embedding or `null`; `null` forces the **MemoryRetriever** onto the FTS-only path (no **HybridScore**).
- `rankMemoryMatchesHybrid` computes a **Bm25TextRank** per candidate, derives **NormalizedBm25** against the per-call max, blends it with **CosineSimilarity** into **HybridBase**, then adds parent-context **RecencyBoost** + **ImportanceBoost** to produce the final score.
- An **EmbeddingDimensionAssertion** runs once on the query embedding and once per candidate **Memory** embedding before any **CosineSimilarity** call.
- A **RankTiebreaker** applies to both FTS-only and hybrid result lists and uses `hybridBase` in place of `textRank` for the hybrid sort.

## Example dialogue

> **Dev:** "If one candidate has a tiny BM25 raw score but the set max is also tiny, does it dominate?"
> **Domain expert:** "Yes — **NormalizedBm25** scales by the per-call max, so a weakly matching set can still produce a `1.0` text component. **CosineSimilarity** is the counterweight, and **CosineWeight** (`0.7`) outweighs **FtsWeight** (`0.3`) for that reason."
> **Dev:** "What if the sidecar returns a 512-dim vector?"
> **Domain expert:** "**EmbeddingDimensionAssertion** throws inside **SidecarEmbedClient**, it catches and returns `null`, and the retriever logs a warning and falls back to FTS-only. We never mix dimensions."

## Flagged ambiguities

- **"HybridScore" vs "HybridBase"** — the parent context names the final additive rank **HybridScore**; this sub-area uses **HybridBase** for the pre-boost blend produced by `hybridScore(...)`. Resolution: **HybridBase** is local to ranking math; **HybridScore** is the externally visible final rank.
- **"Weights"** — the parent context documents the blend as `0.6 / 0.4`; the implementation here uses `FtsWeight=0.3` and `CosineWeight=0.7`. Resolution: the code constants are authoritative; the parent prose is stale and should be reconciled.
