# Search

Sub-area of Knowledge Workspace that resolves a user or agent query into ranked **SearchHits** across every indexed `source_kind`, applying scope, filters, facets, scoring, and click telemetry.

## Language

**SearchBackend**:
The pluggable query implementation — `PGliteBackend` (default, Postgres FTS + optional pgvector hybrid) or `MeilisearchBackend` (external, feature-flagged), with PGlite as fallback when the external index is unreachable.
_Avoid_: Engine, driver, provider.

**HybridScore**:
A blended ranking combining normalized BM25 (`0.35`) and pgvector cosine similarity (`0.65`), used when the `embeddings` feature flag is on and the query is non-empty.
_Avoid_: Combined score, mixed rank, vector boost.

**BaseScore**:
The PGlite-only ranking sum: `ts_rank_cd` plus a 14-day recency decay plus per-`source_kind` priors (open task, high-importance memory, spec/adr/runbook doc, succeeded run).
_Avoid_: Default score, plain rank.

**FacetCounts**:
Per-bucket result counts returned alongside hits for `source_kind`, `doc_type`, `status`, `assignee_id`, `repo_id`, and `author_id`, computed on the deduped result set.
_Avoid_: Aggregations, buckets, group counts.

**QuickFilter**:
An inline `key:value` token (`kind:`, `project:`, `assignee:`, `status:`, `tag:`) parsed off the front of the raw query string and lifted into structured filters before search executes.
_Avoid_: Operator, prefix, modifier.

**NlFilter**:
A natural-language-to-`SavedViewQuery` translation produced by the inference sidecar (5s timeout), with plain-text passthrough as fallback when translation fails.
_Avoid_: AI query, smart filter, parsed query.

**SearchClick**:
A telemetry row recording which result (`result_kind`, `result_id`, `position`) a user opened for a given `query_hash`, written only when the `search-click-telemetry` flag is on.
_Avoid_: Selection, open event, hit log.

**QueryHash**:
A stable SHA-256 of `orgId + queryText + JSON.stringify(sortedFilters)` that lets repeated identical queries aggregate clicks.
_Avoid_: Query id, cache key, fingerprint.

**SearchCache**:
A per-process LRU keyed by `orgId + queryHash` with a 60s TTL that memoizes one `SearchQueryOutput` per distinct query.
_Avoid_: Result cache, memo, store.

**Snapshot**:
A serialized Orama JSON dump of up to 5,000 org-scoped `search_documents` rows shipped to the browser for offline / SSR-hydrated client-side full-text search.
_Avoid_: Export, dump, bundle.

**CommandScore**:
A tiered command-palette ranking — exact (1000), prefix (500-taper), subsequence (100+proximity), miss (0) — distinct from document scoring.
_Avoid_: Fuzzy score, palette rank.

**Suggest**:
A prefix `ILIKE` autocomplete over `search_documents.title`, capped at five results.
_Avoid_: Typeahead, complete, hint.

## Relationships

- A query enters as a raw string; `parseQuickFilter` peels **QuickFilter** tokens off the front, leaving a clean query plus structured filters.
- A non-empty clean query routed through the **SearchBackend** returns ranked **SearchHits** with **FacetCounts**; with `embeddings` on it uses **HybridScore**, else **BaseScore**.
- A **SearchCache** hit short-circuits the **SearchBackend** call entirely; misses populate the cache after the backend resolves.
- An **NlFilter** translation, when used, replaces or augments the structured filter set before backend dispatch — there is no separate NL query path.
- A **SearchClick** belongs to one **QueryHash**; many clicks share one **QueryHash** across users in the same org.
- A **Snapshot** is built per org from the same `search_documents` table the **SearchBackend** queries, but is consumed client-side, not server-side.
- **CommandScore** and **Suggest** operate outside the **SearchBackend**; they are palette/autocomplete primitives, not document search.

## Example dialogue

> **Dev:** "If I type `kind:doc deployment runbook`, does the backend see the whole string?"
> **Domain expert:** "No — `parseQuickFilter` lifts `kind:doc` into a structured filter, and the **SearchBackend** receives `q = 'deployment runbook'` with `kind = 'doc'`. The **QuickFilter** never reaches the tsquery."
> **Dev:** "And if the `embeddings` flag is on?"
> **Domain expert:** "Then the PGlite backend runs the **HybridScore** path — `0.35 * normalized_bm25 + 0.65 * cosine` — instead of returning the raw **BaseScore**. Same filters, different ranker."

## Flagged ambiguities

- **"Score"** — covers **BaseScore** (PGlite-only), **HybridScore** (BM25+vector), and **CommandScore** (palette tiers). Resolution: always qualify; never say "score" alone in this sub-area.
- **"Filter"** — covers **QuickFilter** (inline `key:value`), `SearchFilters` (structured backend input), and **NlFilter** (sidecar translation). Resolution: name the variant; reserve "filters" plural for the structured `SearchFilters` shape on the wire.
- **"Suggest"** vs **"CommandScore"** — both feed autocomplete UIs. Resolution: **Suggest** queries `search_documents.title`; **CommandScore** ranks an in-memory command label list — they share no code path.
- **"Snapshot"** — Orama client-side index dump here, unrelated to **Revision** snapshots in the parent Document surface. Resolution: in this sub-area "snapshot" means the Orama JSON; never use it for Revisions.
