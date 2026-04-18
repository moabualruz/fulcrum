---
title: "refactor: memory v3 — L0/L1/L2 tiered architecture per Karpathy/agentmemory"
type: refactor
status: draft
date: 2026-04-18
origin: user-raised architectural feedback (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f + https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2); debugging session on vault body truncation revealed the missing L0/L1 separation
---

# Memory v3 — Tiered L0/L1/L2 Architecture

> **For agentic workers:** REQUIRED SUB-SKILLS: `agent-skills:spec-driven-development` (Phase 0), `agent-skills:planning-and-task-breakdown` (per-PR unit cutting), `agent-skills:incremental-implementation` + `agent-skills:test-driven-development` (every PR), `agent-skills:debugging-and-error-recovery` (migration), `agent-skills:code-review-and-quality` (pre-merge).

**Goal:** Rebuild Fulcrum's memory subsystem around the L0/L1/L2 tiered model from Karpathy's *LLM Wiki* pattern (v1) + agentmemory's extensions (v2). L0 is the short-term raw-dump layer (verbatim, zero truncation, audit-log). L1 is the curated long-term wiki — LLM-maintained markdown pages with confidence scoring, supersession, entity graph, and lifecycle tiers. L2 is the vector index on the *curated* L1 pages + code. Retrieval is hybrid (BM25 + vec + graph) and rank-fused.

**Why this lands:** The current implementation conflates raw and curated memories into one `memories` table and one `vault/memories/curated/` directory, then applies a single blunt `applyKindCap()` truncation that corrupts raw dumps. There is no L0 audit-log, no L1 curation pipeline, no knowledge graph, no confidence/supersession/decay, no consolidation tiers. Recall is FTS5 + vec over flat rows. Every missing piece was identified in the debugging session on 2026-04-18: bash_trace memories cut mid-JSON with no marker, vault body mangled by canonical_text tokenization, 193k vault files that are effectively short-form summaries dressed up as canonical sources.

**Tech Stack:** TypeScript ESM, `better-sqlite3` (existing), `sqlite-vec` (existing), `@xenova/transformers` (existing ONNX), `fulcrum-agent-core` primitives (`globalDataDir`, `getDb`, `projectIdsFromPath`), Kuzu client (existing scaffolding), `chokidar` (vault watcher), vitest. No new runtime deps in Phase 0-3. Phase 4+ may introduce a lightweight entity-extraction prompt (LLM-driven).

**Non-goals (deferred to v3.1+):** Multi-user collaboration, mesh sync across machines, LLM fine-tuning, cross-agent shared wiki, Slack/email ingestion, browser extension, marketplace plugin bundles.

---

## Architecture Decisions

### Layer definitions (load-bearing)

- **L0 — Short-term raw dumps. Verbatim. Zero truncation. Immutable.**
  - Files under `${globalDataDir()}/vault/raw/` (new path; current `vault/memories/curated/` is L1-shaped data misfiled as L0).
  - Source types: `bash_trace`, `tool_trace`, `file_patch`, `session_transcript`, `prompt_attachment`, `web_capture`, `edit_diff`. New kinds added here as ingest surfaces grow.
  - Frontmatter is minimal (id, source_type, session_id, cwd, timestamp, content_hash). Body is the raw material, untouched.
  - Directory layout: `raw/{source_type}/{yyyy}/{mm}/{dd}/{ULID}.md` — ISO-prefix filenames where helpful, ULID otherwise.
  - L0 is read by ingest agents (the user, hooks, watchers) and written by the system. Human-inspectable.
  - No per-kind char cap. Only a process-level SANITY cap (10 MB/file — prevents accidental core-dump ingestion).

- **L1 — Long-term curated wiki. LLM-maintained. Graph-linked.**
  - Files under `${globalDataDir()}/vault/curated/`.
  - Structure:
    ```
    curated/
      index.md               — content catalog (one line per page, category-grouped)
      log.md                 — append-only operation timeline
      entities/              — one page per person, project, library, file, symbol, decision
      concepts/              — topic/pattern pages (e.g. "sanitize-before-WAL invariant")
      pages/                 — source-summary pages (compressed L0 into a page)
      synthesis/             — cross-source analyses ("what we know about X")
    ```
  - Page frontmatter: `id`, `type` (entity|concept|page|synthesis), `confidence` (0..1), `first_seen`, `last_confirmed`, `sources[]` (→ L0 IDs), `supersedes[]` (→ L1 IDs this replaces), `superseded_by[]`, `entities[]` (→ entity IDs), `access_count`, `retention_tier` (working|episodic|semantic|procedural).
  - Body is LLM-synthesized prose, NOT raw dumps. Cross-linked via Obsidian-style `[[wikilinks]]`.
  - SQLite `memories` table becomes the L1 INDEX (1:1 with L1 files). Schema adds the lifecycle fields above.
  - L1 pages are `writeable` only by the curator pipeline (Phase 3). Human edits go through git, re-ingested on watcher event.

- **L2 — Vector index on L1 curated pages + code_chunks.**
  - `vec_memories` embeds L1 page bodies (the distilled content — NOT L0 raw dumps).
  - `vec_chunks` embeds code_chunks (unchanged — already populates in indexer daemon).
  - Retrieval is hybrid: FTS5 BM25 + vec cosine + graph traversal + RRF fusion. Existing `recall.ts` pipeline extended (not replaced).

### Knowledge graph

- **Entity/relationship tables in SQLite** (first-class, not a Kuzu afterthought):
  ```sql
  CREATE TABLE graph_entities (
    entity_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,           -- person|project|library|file|symbol|concept|decision
    name TEXT NOT NULL,
    aliases TEXT,                 -- JSON array
    confidence REAL DEFAULT 1.0,
    first_seen TEXT NOT NULL,
    last_confirmed TEXT NOT NULL,
    attributes TEXT               -- JSON bag
  );
  CREATE TABLE graph_edges (
    edge_id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL REFERENCES graph_entities(entity_id),
    to_id   TEXT NOT NULL REFERENCES graph_entities(entity_id),
    rel_type TEXT NOT NULL,       -- uses|depends_on|contradicts|caused|fixed|supersedes|about|mentions
    confidence REAL DEFAULT 1.0,
    source_ids TEXT,              -- JSON array of L0 IDs
    created_at TEXT NOT NULL
  );
  ```
- Kuzu client stays optional (v3.1 migration target). SQLite tables are authoritative for now.

### Lifecycle

- **Confidence scoring.** Every L1 page carries a 0..1 confidence. Increments on source reinforcement; decays per Ebbinghaus curve (`confidence *= exp(-λ * days_since_last_confirm)`). λ tunable per `retention_tier`: `working: λ=0.3/day`, `episodic: λ=0.1/day`, `semantic: λ=0.01/day`, `procedural: λ=0.001/day`.
- **Supersession.** When new L0 evidence contradicts an L1 claim, the curator writes a new page with `supersedes: [old_id]` and marks the old `superseded_by: [new_id]`. Old page stays (audit), recall filters it out by default.
- **Consolidation tiers.** Promotion pipeline:
  - `working` — just-extracted from L0 (hours-to-days lifespan)
  - `episodic` — session-scoped summaries (days-to-weeks)
  - `semantic` — cross-session facts (weeks-to-months)
  - `procedural` — patterns and workflows (months-to-years)
  - Promotion triggers: access_count threshold, reinforcement count, confidence floor, age threshold. Tuned empirically; defaults documented below.
- **Forgetting.** Pages with confidence < 0.1 AND no access in 30 days move to `curated/.archive/` (hidden but kept on disk for audit). Retrieval ignores `.archive`. Never hard-deleted without operator opt-in.

### L0 → L1 curation pipeline

- **Curator** is a process that reads new L0 files and updates L1 pages. Implementation choices:
  - **Phase 3a:** manual trigger (`fulcrum memory curate <L0-file-id>`) — LLM agent invoked via existing agent-run infrastructure. Stable, verifiable.
  - **Phase 3b:** auto-trigger via vault watcher on new L0 files, debounced 30s. Opt-in via env.
  - **Phase 3c:** scheduled consolidation pass (nightly / on-demand via `fulcrum memory consolidate`).
- Curator output is a git-committable diff in `vault/curated/`. Every curation operation appends to `log.md` with source IDs + affected pages + confidence deltas.
- Curator is LLM-driven but not black-box: uses a strict prompt template that outputs structured JSON with { page_edits[], new_pages[], new_edges[], supersessions[] }; applied by deterministic code.

- **Inference backend — pluggable, reuses user's existing auth.** Curation is a stateless extraction task (given L0 body → structured JSON), so we push it through the user's already-paid LLM plan rather than requiring a separate OpenAI API key. Selection order:
  1. `FULCRUM_CURATOR_BACKEND` env override (`codex` | `pi` | `openai` | `anthropic`) — explicit.
  2. `codex` CLI on PATH + authenticated → spawn `codex exec --json --output-schema=<schema.json>`. Uses the user's ChatGPT Plus/Pro subscription — zero marginal cost for subscribers.
  3. `pi` CLI on PATH → spawn `pi run --json --output-schema=<schema.json>`. Same ChatGPT auth via pi's own handoff.
  4. `OPENAI_API_KEY` set → direct API call with Structured Outputs (`response_format: { type: 'json_schema', strict: true }`), model `gpt-5-nano` (cheapest + explicitly recommended by OpenAI for classification/extraction workloads).
  5. `ANTHROPIC_API_KEY` set → Claude Haiku via API.
  6. None of the above → `fulcrum memory curate` fails loudly with install instructions; L0 ingestion continues to work so no data is lost — only curation is paused.
- **Why subprocess over direct API when subscription is present:** A ChatGPT Pro plan's 20x multiplier makes backfilling 1k-10k historical memories cost nothing on top of the monthly fee. Direct API would bill separately (~$5-$10 for a one-time backfill, ~$0.0005/memory ongoing) — small absolute numbers, but it's a second billing relationship users must set up. Subscription reuse wins on UX even when the dollar delta is small.
- **Why GPT-5 Nano for the API fallback:** $0.05/M input + $0.40/M output (cheapest in the lineup); OpenAI's docs explicitly route classification and extraction to Nano; Structured Outputs GUARANTEE schema conformance at the token-generation level via the CFG engine in GPT-5.2+. 2k-token L0 source with ~1k-token structured output ≈ $0.0005 per curation. Batch API cuts this in half (50% off, async within 24h) — used for Phase 6 one-time backfill.
- **Backend abstraction:** `l1/curator-backend/{codex,pi,openai,anthropic}.ts` implement a common `curate(l0_source, schema) → ParsedCuratorOutput` interface. Tests stub the interface; integration tests rotate through real backends in a smoke matrix.

### Retrieval

- `recall_memory` becomes `recall_knowledge` (backward-compat alias retained).
- Pipeline (extends existing `runStagedSearch`):
  1. FTS5 on L1 bodies (current)
  2. vec cosine on vec_memories (current; now on L1 content, not L0 dumps)
  3. Graph traversal from matched entities (new; 1-2 hops)
  4. RRF fusion (k=60, weights ws_fts + ws_vec + ws_graph)
  5. Confidence filter (default floor 0.3)
  6. Supersession filter (default: skip `superseded_by ≠ null`)
  7. Per-page diversification + calibration (current)
- **L0 is not recalled directly.** Callers that need raw traces use `fulcrum memory sources <page_id>` to follow L1 → L0 references.

### Migration strategy

- **No big-bang rewrite.** Each phase ships behind a feature flag and coexists with the current code path until verified.
  - Phase 0 writes the spec + schema migration SQL (no code switch).
  - Phase 1 lights up `vault/raw/` for NEW writes; old `vault/memories/curated/` stays readable during transition.
  - Phase 2 adds `vault/curated/` with new schema columns (NULL-tolerant on existing rows).
  - Phase 3 introduces the curator as an opt-in CLI command.
  - Phase 4 re-embeds L1 pages (additive; old vec_memories rows remain until phase 5 cutover).
  - Phase 5 cutover: recall switches to the new pipeline; old path becomes legacy.
  - Phase 6 one-time migration of existing data — see `Migration` section below.
- **Feature flag:** `FULCRUM_MEMORY_V3` (default off through Phase 4, default on from Phase 5, removed Phase 7).
- Every phase's Verify steps include "old code path still works" until that phase's cutover.

---

## Critical Constraints (carry forward, verbatim)

1. **Global-only data** (HARD). All L0 raw dumps, L1 curated pages, L2 embeddings, audit log, graph tables under `globalDataDir()`. Never project-local.
2. **L0 is verbatim.** Zero truncation, zero normalization, zero sanitization rewrite-in-place (sanitization still RUNS, but it emits a separate sanitized copy at L1-curation time — L0 keeps the raw input for audit even when it contained credentials that needed redaction before exposure).
3. **L1 is LLM-maintained only.** Humans edit via git + vault watcher; system never writes L1 bodies directly (only frontmatter metadata). Curator is the single writer.
4. **Sanitize-before-WAL still applies.** The WAL audit row is populated at L0 ingest time with `content_sha256` only; no cleartext in WAL (existing invariant preserved).
5. **CLI-first primary; MCP overlay.** `fulcrum memory ingest`, `fulcrum memory curate`, `fulcrum memory lint`, `fulcrum memory consolidate`, `fulcrum memory sources`, `fulcrum memory export` — every capability reachable via `fulcrum action exec`. MCP tools are thin shims.
6. **Control-plane features are dormant, not absent.** Curator auto-trigger and consolidation pass are opt-in (`FULCRUM_MEMORY_CURATE_AUTO=1`, `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE=...`). Default install = manual operation.
7. **No confidence hallucination.** Confidence values come from observed evidence (source counts, reinforcement, explicit caller overrides). Never LLM-generated without grounding in L0 sources.
8. **Agent-native parity.** Every action a user can take (ingest, curate, lint, consolidate, query) an agent can also take via MCP / CLI.
9. **Loopback-only** (existing).
10. **Reversible migrations.** Every schema migration has a documented rollback SQL. The Phase 6 one-time data migration runs in a transaction with an abort-and-restore path.

---

## Standard Task Workflow

Every unit in every PR flows through the nine steps from `2026-04-16-memory-v2a-plan.md`. Bootstrap Mode (PRs that rewrite their own dogfooding tools) applies to Phase 0 schema migration and Phase 6 data migration. See `§Bootstrap Mode` below.

---

## Current-state audit (what's there, what's wrong, what we keep)

**Keep (proven primitives):**
- `packages/memory/src/sanitize/*` — sanitization engine, run at L0 ingest + L1 curation.
- `packages/memory/src/wal/*` — WAL audit log with sha256-only bodies.
- `packages/memory/src/vault/client.ts` — file read/write + frontmatter serialize (extended for raw/curated split).
- `packages/memory/src/retrieval/search.ts` + `recall.ts` — RRF pipeline (extended with graph + confidence).
- `packages/memory/src/indexer/` — daemon + registry + watcher + syncer (unchanged; still handles code_chunks).
- `packages/memory/src/kuzu/*` — graph scaffolding (promoted to production in Phase 2).
- `packages/core/src/db/schema.ts` — existing tables kept; new tables added via numbered migration files.

**Rework:**
- `packages/memory/src/write.ts` — currently does the L0+L1+L2 write in one function with `applyKindCap` truncating everything. Split into `ingestRawSource()` (L0 only, no cap), `writeCuratedPage()` (L1, internal to curator), and `recordL2Embedding()` (L2).
- `packages/memory/src/setup/rebuild.ts` — rebuilds L1 from current vault flat layout. Replaced by `rebuildL1FromCurated()` (reads new `curated/` tree) + `rebuildL0Index()` (reads `raw/`).
- `packages/memory/src/validate-kind.ts` — `KIND_CAPS` removed. Kind list split into `L0_SOURCE_TYPES` and `L1_PAGE_TYPES`. Cap logic deleted.
- `packages/cli/src/hooks.ts` — `runPostHook` writes file_patch / bash_trace to L0 directly via `ingestRawSource()`. Drops `command.slice(0, 400)`.
- `packages/cli/src/tool-registry.ts` — `write_memory` replaced by `ingest_raw` + `create_curated_page` (agent-native).
- Existing `vault/memories/curated/` directory — contents migrated in Phase 6 to `vault/raw/` (auto-generated dumps) and `vault/curated/` (hand-curated, if any). Decided case-by-case by kind.

**Delete (after Phase 6 migration completes):**
- `applyKindCap()`, `KIND_CAPS` dict, `cappedContent` variable.
- The `vault/memories/` directory (replaced by `vault/raw/` + `vault/curated/`).
- `vault/memories/operational/` run-scoped layout (replaced by `raw/sessions/...`).
- `memories.canonical_text` column — replaced by on-the-fly FTS tokenization during INSERT.

---

## File Structure (target)

```
${globalDataDir()}/
  vault/                                    ← git-versioned
    raw/                                    ← L0 (NEW)
      bash_trace/        {yyyy}/{mm}/{dd}/  {ULID}.md
      tool_trace/        …
      file_patch/        …
      session_transcript/ …
      prompt_attachment/ …
      web_capture/       …
      edit_diff/         …
      .index.md                             — append-only L0 inventory
      .log.md                               — chronological L0 ops
    curated/                                ← L1 (NEW)
      index.md                              — catalog
      log.md                                — curator ops timeline
      entities/          {ULID}.md
      concepts/          {ULID}.md
      pages/             {ULID}.md
      synthesis/         {ULID}.md
      .archive/                             — soft-deleted (superseded / decayed)
  fulcrum.db                                — central DB (existing path)
  models/                                   — ONNX cache (existing)
  sessions/                                 — agent runs (existing)
  db/wal/                                   — memory-write audit (existing)

packages/memory/src/
  l0/
    ingest.ts                               — NEW: ingestRawSource(kind, body, meta) → L0 file + row
    types.ts                                — NEW: L0 source types, frontmatter schema
  l1/
    curator.ts                              — NEW: LLM-mediated L0→L1 pipeline
    page.ts                                 — NEW: create/update/supersede curated pages
    entities.ts                             — NEW: entity extraction + graph ops
    lifecycle.ts                            — NEW: confidence decay, consolidation tiers, archive
    retrieval.ts                            — REWORK: extends recall.ts with graph + confidence
  l2/
    embed.ts                                — MOVE: storeEmbeddingInVec (existing, relocated)
    code.ts                                 — MOVE: storeChunkEmbedding (existing, relocated)
  vault/
    client.ts                               — EXTEND: raw/curated path split
    watcher.ts                              — EXTEND: fires L0 event bus for raw/, L1 event bus for curated/
  write.ts                                  — THIN WRAPPER: deprecated, re-exports l0/ingest + l1/page for back-compat
  read.ts                                   — NEW: recall_knowledge + get_sources + walk_graph

packages/core/src/db/
  migrations/
    2026-04-19-001-memory-v3-lifecycle.sql  — NEW: alter memories, add graph tables
    2026-04-19-002-memory-v3-source-index.sql — NEW: l0_sources table
    2026-04-19-003-memory-v3-cutover.sql    — NEW: Phase 5 cutover (nullable → NOT NULL)

packages/cli/src/commands/
  memory/
    ingest.ts                               — NEW: fulcrum memory ingest <source_type> < body
    curate.ts                               — NEW: fulcrum memory curate [--all | <l0_id>]
    lint.ts                                 — NEW: fulcrum memory lint
    consolidate.ts                          — NEW: fulcrum memory consolidate
    sources.ts                              — NEW: fulcrum memory sources <l1_page_id>
    export.ts                               — NEW: fulcrum memory export (audit dump)

docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md
                                            — this file

agent-integration/skills/fulcrum/
  l0-ingest.md                              — NEW: guidance for agents writing L0
  l1-curate.md                              — NEW: curator prompt template + examples
  l1-lint.md                                — NEW: lint pass rubric
```

---

## Phased Rollout (PRs)

Every PR ends with CI-green tests + a one-line migration note in `CHANGELOG.md`. Flag-gated where noted. **No PR exceeds ~500 diff lines.** If a unit would cross that bar, it gets split.

### PR 0 — Spec + schema scaffolding

**Goal:** land the spec doc (this file), write the migration SQL, update `CHANGELOG.md`. No code changes.

**Units:**

- **0.1** This plan doc committed to `docs/plans/`.
- **0.2** `packages/core/src/db/migrations/2026-04-19-001-memory-v3-lifecycle.sql` — adds `graph_entities`, `graph_edges`, `l0_sources`, `l1_pages` tables. Existing `memories` gets nullable `retention_tier`, `confidence_decay_at`, `superseded_by`, `consolidated_from_ids` columns.
- **0.3** `packages/core/src/db/migrations/2026-04-19-002-memory-v3-source-index.sql` — indexes on new columns.
- **0.4** `packages/memory/src/l0/types.ts` — TypeScript types only (no runtime code yet).
- **0.5** Update `AGENTS.md` + `agent-integration/claude/CLAUDE.md` with a "Memory tiers (v3 draft)" section.

**Verify:** `pnpm build` (no new source is required to typecheck yet); `pnpm test` (unchanged); `sqlite3 :memory: < migration.sql` runs clean.

### PR 1 — L0 raw-ingest + vault path split

**Goal:** new writes go to `vault/raw/`, no truncation, no sanitization-rewrite-in-place. Old path still runs for anything that hasn't switched yet.

**Units:**

- **1.1** `l0/ingest.ts` exports `ingestRawSource({ source_type, body, meta }) → L0File`. Writes `vault/raw/{source_type}/yyyy/mm/dd/{ULID}.md`. Frontmatter minimal. Inserts `l0_sources` row. Emits bus event.
- **1.2** `vault/client.ts` — split `writeMemoryFile` into `writeRawFile` + `writeCuratedFile`. Old function kept as back-compat wrapper routing to curated until PR 2 cutover.
- **1.3** `vault/watcher.ts` — watch both `raw/` and `curated/` roots, emit distinct `raw-change` and `curated-change` events.
- **1.4** `packages/cli/src/hooks.ts` — `runPostHook` file_patch / bash_trace branches call `ingestRawSource` (full body, no slice). Flag-gated on `FULCRUM_MEMORY_V3=1` so prod stays on the old path until PR 5.
- **1.5** Regression tests: raw dump of 10 KB bash command lands verbatim; L0 file round-trips through WAL audit; old write path (flag off) unchanged.

**Verify:** `FULCRUM_MEMORY_V3=1 pnpm -F fulcrum-memory test src/tests/l0-ingest.test.ts`; manual e2e: `fulcrum hook claude post` with long heredoc → check vault/raw/bash_trace/ for verbatim body.

### PR 2 — L1 curated page primitives (no curator yet)

**Goal:** create/update/read L1 pages programmatically. Curator logic deferred to PR 3. No auto-curation yet.

**Units:**

- **2.1** `l1/page.ts` — `createCuratedPage`, `updateCuratedPage`, `supersedeCuratedPage`, `readCuratedPage`. Each writes to `vault/curated/{type}/{ULID}.md` + `l1_pages` row.
- **2.2** `l1/entities.ts` — `upsertEntity`, `addEdge`, `getEntityGraph(entity_id, depth)`. SQLite-backed. Kuzu optional mirror in later phase.
- **2.3** Page frontmatter serializer: structured YAML with list fields (`sources`, `supersedes`, `entities`), preserves round-trip through `readMemoryFile`.
- **2.4** CLI stub: `fulcrum memory page create|show|supersede` for operator debugging. Not surfaced in MCP until PR 3.
- **2.5** Unit tests: page round-trip, supersession chain, graph traversal 2-hop.

**Verify:** `pnpm -F fulcrum-memory test src/tests/l1-page.test.ts`; `fulcrum memory page create --type entity --name React → fulcrum memory page show <id>`.

### PR 3 — Curator pipeline (manual trigger)

**Goal:** `fulcrum memory curate <l0_id>` reads an L0 source, runs curator prompt through the auto-selected backend, applies structured edits to L1. No auto-trigger yet.

**Units:**

- **3.1** `l1/curator.ts` — prompt template + structured-output parser + backend dispatcher. Selects inference backend per §L0→L1 curation pipeline rules (env override > codex > pi > openai > anthropic).
- **3.2** `l1/curator-backend/codex.ts` — spawns `codex exec --json --output-schema=<path>` with L0 body on stdin, streams JSONL events, captures the final schema-constrained JSON. Handles exit codes + stderr propagation. Primary backend when user is on a ChatGPT Plus/Pro plan.
- **3.3** `l1/curator-backend/pi.ts` — same interface for pi CLI (stub in PR 3, filled when pi's non-interactive mode stabilizes).
- **3.4** `l1/curator-backend/openai.ts` — direct OpenAI API call with `response_format: { type: 'json_schema', strict: true }`, model `gpt-5-nano`. Used in CI / headless / users without codex.
- **3.5** Deterministic apply-layer: takes the curator's JSON output `{ new_pages, updates, supersessions, new_edges }` and executes via `l1/page.ts` + `l1/entities.ts`. Atomic per-call (all-or-nothing).
- **3.6** `packages/cli/src/commands/memory/curate.ts` — `fulcrum memory curate <l0_id> [--dry-run] [--backend codex|pi|openai]`.
- **3.7** Curator telemetry: appends to `vault/curated/log.md` with `{l0_id, backend, affected_pages[], new_entities[], confidence_deltas[], duration_ms, prompt_version}`.
- **3.8** Tests: stub curator backend → verify L1 + graph state mutations; dry-run prints diff without writing; backend rotation test covers codex / openai paths (pi skipped when not installed).

**Verify:** `fulcrum memory curate <some_l0_id> --dry-run` prints the page diffs; without `--dry-run` they land; `cat vault/curated/log.md` shows the audit entry including selected backend; manual toggle `FULCRUM_CURATOR_BACKEND=openai fulcrum memory curate <id>` routes to API path.

### PR 4 — L2 reshaping: embed L1 pages, keep code_chunks

**Goal:** `vec_memories` embeds L1 page bodies (distilled content). Existing code_chunks embeddings unchanged.

**Units:**

- **4.1** Relocate `storeEmbeddingInVec` + `storeChunkEmbedding` into `packages/memory/src/l2/`.
- **4.2** Curator (PR 3 output) now triggers `recordL1Embedding(page_id)` after each page write/update. Existing fire-and-forget flush semantics carry over (the `flushPendingMemoryWrites` story from the prior work).
- **4.3** Add `fulcrum memory reindex-l2 [--pages|--code]` for operator one-shot re-embedding.
- **4.4** Tests: create L1 page → vec_memories has row; update page → embedding replaced; supersede → old row marked (but kept — supersession is audit, not deletion).

**Verify:** `fulcrum memory reindex-l2 --pages` completes; `sqlite3 "SELECT COUNT(*) FROM vec_memories" == L1 page count`.

### PR 5 — Retrieval cutover: confidence + graph + supersession filters

**Goal:** `recall_memory` / `recall_knowledge` uses the new pipeline. Flag flips to default-on.

**Units:**

- **5.1** Extend `retrieval/search.ts` with graph-traversal stage + confidence filter + supersession filter.
- **5.2** Reciprocal rank fusion weights configurable via env (defaults `fts=1.0, vec=1.0, graph=0.5`).
- **5.3** `recall_knowledge` new action; `recall_memory` aliased for back-compat.
- **5.4** Agent-facing: `fulcrum memory sources <page_id>` walks `l1_pages.sources → l0_sources` → prints or pipes.
- **5.5** Flip default `FULCRUM_MEMORY_V3` to on. Old path callable via `FULCRUM_MEMORY_V3=0` for one release cycle.
- **5.6** Integration tests: corpus of 20 L0 dumps → 10 L1 pages → recall a query that requires graph traversal → verify expected page ranks.

**Verify:** `fulcrum memory recall "auth middleware"` returns L1 pages ordered by fused score; `fulcrum memory recall "auth middleware" --explain` prints per-stage ranks.

### PR 6 — Data migration: existing vault/memories/ → vault/raw + vault/curated

**Goal:** one-time migration of the 193 k existing files into the new layout. Transactional. Reversible up to the commit.

**Units:**

- **6.1** Classifier: maps each existing memory by `kind` to `L0_raw` (bash_trace, file_patch, tool_trace, session_summary) or `L1_curated_stub` (decision, identity, persona, concept, fact). Dry-run prints the mapping.
- **6.2** Migrator: for L0-class, copy body verbatim to `vault/raw/{kind}/...`; for L1-class, create a stub curated page with `sources: []` (no original L0 exists) and confidence floor 0.5 (human-edited).
- **6.3** Regenerate `l0_sources` + `l1_pages` rows; retain `memory_id` for back-compat so existing recall events don't break.
- **6.4** DB migration `2026-04-19-003-memory-v3-cutover.sql` runs last: drops `memories.canonical_text`, flips nullable columns to NOT NULL, indexes.
- **6.5** Verification pass: `fulcrum memory lint` reports zero orphans, zero missing-source references, zero cycle in supersession graph.
- **6.6** Rollback script `fulcrum memory rollback --to v2` (operator-only, not agent-exposed) restores from pre-migration snapshot.

**Verify:** Fresh vault + DB → seed 10 representative rows of each kind via the old path → run `fulcrum memory migrate` → all 10 land in the right tier with complete round-trip.

### PR 7 — Lifecycle: decay, supersession, consolidation, lint

**Goal:** confidence decay runs as scheduled pass; supersession auto-detected on contradiction; lint pass surfaces health issues.

**Units:**

- **7.1** `l1/lifecycle.ts` — `applyDecay()` (time-based confidence update), `promoteToTier(page_id, target_tier)`, `archivePage(page_id)`.
- **7.2** Contradiction detector: curator output includes `{ contradicts: [old_page_id] }`; auto-applies supersession when confidence of new evidence ≥ old.
- **7.3** `fulcrum memory lint` — orphan pages, broken wikilinks, cyclic supersession, stale claims (last_confirmed > 90d AND confidence > 0.5), missing source_ids.
- **7.4** `fulcrum memory consolidate` — finds pages with same entity set + same `retention_tier` AND confidence ≥ threshold; proposes a merged page to curator.
- **7.5** Tests: decay curve matches Ebbinghaus formula within 1%; consolidation dry-run prints proposed merges.

**Verify:** `fulcrum memory lint` returns clean on the freshly-migrated vault; inject a contradiction source → `fulcrum memory curate` → old page marked superseded.

### PR 8 — Auto-triggers (opt-in), observability, docs

**Goal:** curator + consolidator run automatically (opt-in). Metrics surface. Docs updated.

**Units:**

- **8.1** Vault watcher fires L0 → curator (debounced 30s) when `FULCRUM_MEMORY_CURATE_AUTO=1`.
- **8.2** Scheduled consolidation pass via `fulcrum serve monitor` cron when `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE=daily`.
- **8.3** Metrics: L0 ingest rate, L1 page count by tier, curation latency p50/p95, graph node + edge count, confidence distribution histogram. Surfaced at `GET /memory/stats`.
- **8.4** `docs/architecture/memory-v3.md` — user-facing docs + examples.
- **8.5** Update `CLAUDE.md` + `AGENTS.md` skill docs; update `docs/plans/MASTER-PLAN.md`.

**Verify:** Auto-flag on + `fulcrum hook claude post` with a file_patch → curator fires within 60s → L1 page appears; `GET /memory/stats` returns populated counts.

### PR 9 — Cleanup: delete dead code

**Goal:** delete `applyKindCap`, `KIND_CAPS`, `memories.canonical_text`, legacy `writeMemory` shim, `vault/memories/` directory.

**Units:**

- **9.1** Remove `validate-kind.ts` cap logic.
- **9.2** Remove `write.ts` back-compat shim (callers migrated in PR 5).
- **9.3** Remove `canonical_text` column via migration `2026-04-19-004-drop-canonical-text.sql`. FTS5 trigger now reads `content`.
- **9.4** Delete empty `vault/memories/` directory + commit `.gitkeep` removal.
- **9.5** Grep-clean any references to `MEMORY_V3` flag (now the default).

**Verify:** Full test suite green; `grep -r "applyKindCap\|canonical_text\|KIND_CAPS" packages/` empty.

---

## Bootstrap Mode

PRs 0 (migrations rewrite schema), 3 (curator reads its own L1 pages to build prompts), and 6 (one-time data migration) are Bootstrap PRs. During those PRs, the Standard Task Workflow's `mcp__fulcrum__*` calls and `recall_memory` reads risk returning stale data.

Substitutes during Bootstrap:

| Step | Normal | Bootstrap |
|---|---|---|
| 1 Orient | `mcp__fulcrum__build_cos_context` | Read this plan + `docs/plans/MASTER-PLAN.md` directly |
| 4 Open run | `mcp__fulcrum__start_agent_run` | Manual run_id via `uuidgen`; record in `log.md` |
| 6 Heartbeat | `mcp__fulcrum__heartbeat_agent_run` | Skip (operator will observe CI) |
| 9 Record decision | `mcp__fulcrum__write_memory` (kind=decision) | Append to `docs/plans/2026-04-18-002-memory-tiered-architecture-plan-review.md` |

Skills (`agent-skills:*`, `compound-engineering:*`, `find-docs`) stay in for every Bootstrap PR.

---

## Testing Strategy

- **Unit tests** per new module (l0/ingest, l1/page, l1/entities, l1/curator, l1/lifecycle, l2/embed). Each file must maintain ≥80% line coverage.
- **Round-trip tests** for every vault file format: write → read → re-write → bytewise equal.
- **Migration tests**: seed N=100 rows via old path → migrate → assert mapping + no data loss. Rollback restores pre-migration state.
- **Integration tests**: 3-session synthetic corpus → curate → recall queries test all three retrieval stages (fts/vec/graph) → assert expected ranks.
- **Regression tests**: every bug found during implementation gets a failing test that proves the fix (Prove-It pattern from `agent-skills:debugging-and-error-recovery`).
- **E2E live daemon test**: fresh vault + DB → end-to-end session (ingest → curate → recall → export) → verify full audit trail.
- **Performance budgets**:
  - L0 ingest: p95 < 50 ms (no LLM call)
  - L1 page create: p95 < 100 ms (no LLM call)
  - Curation: p95 < 10 s per L0 source (LLM call included)
  - Recall p95: unchanged from v2a (< 500 ms)

---

## Open Questions (track in `-plan-review.md` as we hit them)

1. **Curator model choice. → RESOLVED 2026-04-18.** Pluggable backend with auto-detection order `codex → pi → openai → anthropic`. Primary path for subscribers is `codex exec --json --output-schema=<schema>` — reuses the user's ChatGPT Plus/Pro plan auth, zero marginal cost. API fallback uses `gpt-5-nano` ($0.05/$0.40 per M tokens) with Structured Outputs (strict JSON schema). See §L0→L1 curation pipeline for the full selection flow.
2. **Prompt version pinning.** When curator prompt changes, should past L1 pages be re-curated? Mark prompt_version on each page; offer `fulcrum memory recurate --prompt-version >= N`.
3. **Entity deduplication.** Two L0 sources mention "React" — one synthesis page or one per. Starting rule: one canonical entity page, aliases array for variants.
4. **Confidence arithmetic.** Bayesian update vs. weighted average vs. counter-based. Start with counter-based (simple, auditable), revise after Phase 7 empirical data.
5. **Kuzu activation.** Phase 2 uses SQLite tables. Kuzu mirror added when graph reaches ~10k edges and SQLite traversal latency crosses 100 ms p95. Pure performance trigger.
6. **Schema versioning.** L1 page frontmatter schema will evolve. `schema_version` field on every page; curator handles downconversion on read.
7. **Secrets at L0. → DEFERRED 2026-04-18.** Local-only data; if a user pastes secrets into a prompt, no vault design prevents that. Document that L0 inherits the `globalDataDir()` filesystem perms (0700 by default on POSIX) and revisit if we add remote/multi-user scenarios.
8. **Cross-project shared entities.** "React" mentioned in project A and project B — global L1 entity or per-project? Default: workspace-scoped entities; cross-workspace "global" entities behind an operator flag.
9. **Migration downtime. → RESOLVED 2026-04-18.** No forced cutoff. Phase 6 migration runs while system is live; reads use old path until cutover commit, writes route to new path from PR 1. User will voluntarily hold new work during the migration window — we just notify and proceed.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Curator LLM output non-deterministic → L1 drift across runs | Strict JSON schema validation on curator output; retry with temperature 0; dry-run mode for review |
| 193k existing files migration → hours of IO | Migration runs in parallel batches of 1k, resumable via checkpoint file |
| FTS5 index rebuild on column rename | PR 6 rebuilds fts triggers after content column refactor; tested on a copy of prod DB |
| User edits vault files between ingest and curation → conflict | Vault watcher on `curated/` detects human edits; curator merges (LLM prompt includes "respect human edits"); conflicts flagged in `log.md` |
| Entity extraction quality low early → noisy graph | Confidence floor on graph edges; lint pass flags low-confidence entities; operator can purge via `fulcrum memory entity archive` |
| L2 embedding cost balloon (every page update re-embeds) | Hash-based change detection: embed only when body_hash differs from last_embedded_hash |
| Retrieval latency regression from graph stage | Graph stage behind a per-query budget (100 ms); if exceeded, fall back to fts+vec only |
| Rollback complexity (multi-phase migration) | Each phase's migration has an explicit rollback SQL + a `fulcrum memory rollback --to vN` operator command; tested per-phase |

---

## Timeline estimate

Rough, assuming one engineer, no heavy blockers:

| PR | Effort |
|---|---|
| 0 | 1 day |
| 1 | 2 days |
| 2 | 2 days |
| 3 | 3 days (LLM plumbing) |
| 4 | 1 day |
| 5 | 2 days |
| 6 | 3 days (data migration + verify) |
| 7 | 2 days |
| 8 | 2 days |
| 9 | 1 day |

Total: ~3 weeks focused. Buffer for review + regressions: 1 week. Shippable increment per PR — nothing blocks on the full chain.

---

## Approval checklist (before PR 0 lands)

- [ ] User approves the phased breakdown (this doc)
- [x] ~~Open Question #7 (L0 secrets)~~ — deferred per 2026-04-18 discussion
- [x] ~~Open Question #1 (curator model)~~ — codex-subprocess-primary via user's Pro plan; `gpt-5-nano` API fallback
- [x] ~~Migration downtime window~~ — no cutoff; notify user when Phase 6 starts; they hold new work voluntarily
- [ ] Test corpus + success criteria for Phase 5 retrieval cutover agreed

Once the remaining box is checked, PR 0 opens and the sequence runs.
