---
title: "refactor: memory v3 — L0/L1/L2 tiered architecture per Karpathy/agentmemory"
type: refactor
status: draft
date: 2026-04-18
origin: user-raised architectural feedback (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f + https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2); debugging session on vault body truncation revealed the missing L0/L1 separation
---

# Memory v3 — Tiered L0/L1/L2 Architecture

> **For agentic workers:** This plan is skill-dense. See `§Skill Utilization Matrix` below for the authoritative mapping of skill → PR → unit. Every unit names the skills required at that point. Skipping a required skill is an auditable defect.

**Goal:** Rebuild Fulcrum's memory subsystem around the L0/L1/L2 tiered model from Karpathy's *LLM Wiki* pattern (v1) + agentmemory's extensions (v2). L0 is the short-term raw-dump layer (verbatim, zero truncation, audit-log). L1 is the curated long-term wiki — LLM-maintained markdown pages with confidence scoring, supersession, entity graph, and lifecycle tiers. L2 is the vector index on the *curated* L1 pages + code. Retrieval is hybrid (BM25 + vec + graph) and rank-fused.

**Why this lands:** The current implementation conflates raw and curated memories into one `memories` table and one `vault/memories/curated/` directory, then applies a single blunt `applyKindCap()` truncation that corrupts raw dumps. There is no L0 audit-log, no L1 curation pipeline, no knowledge graph, no confidence/supersession/decay, no consolidation tiers. Recall is FTS5 + vec over flat rows. Every missing piece was identified in the debugging session on 2026-04-18: bash_trace memories cut mid-JSON with no marker, vault body mangled by canonical_text tokenization, 193k vault files that are effectively short-form summaries dressed up as canonical sources.

**Tech Stack:** TypeScript ESM, `better-sqlite3` (existing), `sqlite-vec` (existing), `@xenova/transformers` (existing ONNX), `fulcrum-agent-core` primitives (`globalDataDir`, `getDb`, `projectIdsFromPath`), Kuzu client (existing scaffolding), `chokidar` (vault watcher), vitest. No new runtime deps in Phase 0-3. Phase 4+ may introduce a lightweight entity-extraction prompt (LLM-driven).

**Non-goals (deferred to v3.1+):** Multi-user collaboration, mesh sync across machines, LLM fine-tuning, cross-agent shared wiki, Slack/email ingestion, browser extension, marketplace plugin bundles.

---

## Skill Utilization Matrix

Every non-fulcrum skill in the local arsenal is mapped to a concrete point in this plan where it earns its keep. Skills marked **(cross-cutting)** apply to every PR; all others fire at specific PRs/units. The implementing agent MUST invoke the listed skill at the named moment (the harness will flag a missing invocation as a defect).

### Cross-cutting (every PR, every unit)

| Skill | Role |
|---|---|
| `agent-skills:incremental-implementation` | Thin vertical slices; no PR exceeds ~500 diff lines; no unit lands without its Verify gate passing. |
| `agent-skills:test-driven-development` | Failing test FIRST, then thinnest impl. Every behavioural change has a committed regression test. |
| `agent-skills:context-engineering` | Load only the files the task requires; refuse guess-work on stale snapshots. |
| `agent-skills:code-review-and-quality` | 5-axis self-review (correctness/readability/architecture/security/performance) before requesting human review. |
| `compound-engineering:ce-review` | Structured persona-tiered review pre-merge. Fires when diff ≥50 LOC or touches auth/data/IO. |
| `agent-skills:git-workflow-and-versioning` + `compound-engineering:git-commit` | Atomic, value-communicating commits; conventional format. |
| `compound-engineering:ce-pr-description` | Every PR has a value-first description written by this skill. |
| `andrej-karpathy-skills:karpathy-guidelines` | Surgical changes, no speculative abstractions, verifiable success criteria. |
| `compound-engineering:context7` + `agent-skills:source-driven-development` + `find-docs` | Any library API touched gets verified against current docs — training data is stale. |
| `episodic-memory:remembering-conversations` | Before starting any PR, search prior sessions for "tried this before" lessons. |

### Per-PR mapping

#### PR 0 — Spec + schema scaffolding
- `agent-skills:spec-driven-development` — this plan IS the spec; Phase 0 lands it.
- `compound-engineering:document-review` — run adversarial + coherence + feasibility + scope-guardian reviews over this plan before PR 0 merges.
- `agent-skills:documentation-and-adrs` — ADR capture for each Architecture Decision above.
- `elements-of-style:writing-clearly-and-concisely` — every prose paragraph in the spec + CHANGELOG entry passes Strunk pass.
- `compound-engineering:onboarding` — regenerate ONBOARDING.md's memory section to reflect v3.

#### PR 1 — L0 raw-ingest + vault path split
- `agent-skills:api-and-interface-design` — `ingestRawSource(kind, body, meta)` signature is a public contract that the entire downstream depends on; design deliberately.
- `agent-skills:security-and-hardening` — L0 files inherit `globalDataDir()` perms; regression test that writes respect 0600.
- `find-docs` — verify node `fs.writeFileSync` + `mkdirSync` current API for recursive + mode flags.

#### PR 2 — L1 templates + page primitives + validator
- `agent-skills:api-and-interface-design` — validator error codes are a public surface; stable contract.
- `agent-skills:documentation-and-adrs` — ADR: "L1 pages are template-gated; free-form writes are rejected."
- `elements-of-style:writing-clearly-and-concisely` — template bodies themselves must pass Strunk (they're user-facing markdown).
- `compound-engineering:every-style-editor` — style-pass the templates' prose scaffolding.
- `find-docs` — `yaml` / `gray-matter` library version + YAML 1.2 compliance.

#### PR 3 — Curator pipeline
- **`codex:gpt-5-4-prompting` — load-bearing. This is the skill that composes the curator prompt.** Every curator task (extraction, consolidation, synthesis) has its prompt written via this skill.
- `codex:codex-cli-runtime` — subprocess contract for `codex exec --json --output-schema`; handles exit codes, stdout/stderr separation, JSONL framing.
- `codex:codex-result-handling` — parse the JSONL event stream into the structured `{ new_pages, updates, supersessions, new_edges }` object; validate against schema.
- `agent-skills:security-and-hardening` — curator input is untrusted (L0 body may contain injection); prompt isolates `<USER_CONTENT>` via delimiter strategy from `codex:gpt-5-4-prompting`.
- `agent-skills:source-driven-development` — verify OpenAI Structured Outputs spec + codex CLI non-interactive mode docs before writing the backend.
- `compound-engineering:agent-native-architecture` — the backend selection interface and the mark-wrong → correction L0 → re-curate loop are agent-native. Users and agents share the same surface.
- `andrej-karpathy-skills:karpathy-guidelines` — curator output handler: no speculative error recovery, no dead code paths for "maybe the LLM returns foo."

#### PR 4 — L2 reshape (embed L1, keep code_chunks)
- `agent-skills:performance-optimization` — embedding throughput; batch queue; backpressure; p95 budget; profiled before flipping default.
- `find-docs` — `@xenova/transformers` batch-embed API.

#### PR 5 — Retrieval cutover (graph + confidence + supersession)
- `agent-skills:performance-optimization` — graph traversal has a 100ms budget per query; profile before default-on.
- `compound-engineering:ce-optimize` — metric-driven iteration on RRF weights (`ws_fts`, `ws_vec`, `ws_graph`) against the eval corpus; don't hand-pick.
- `compound-engineering:agent-native-architecture` — new inspection/correction surface (`sources`, `inspect`, `read-raw`, `trace`, `mark-wrong`) must have CLI + MCP parity.
- `agent-skills:test-driven-development` — eval corpus (see §Test Corpus) is the failing-test-first artefact; PR 5.6 cutover blocks on it passing.
- `compound-engineering:ce-review` — full pre-cutover review by adversarial + correctness + performance personas before `FULCRUM_MEMORY_V3` default flips.

#### PR 6 — Data migration
- `agent-skills:deprecation-and-migration` — load-bearing. Migration IS a deprecation.
- `compound-engineering:ce-debug` — inevitable first-run issues; reproduce → localize → fix → guard.
- `agent-skills:debugging-and-error-recovery` — every failure case gets a test before the retry.
- `agent-skills:security-and-hardening` — rollback SQL + audit chain reviewed for gaps.
- `agent-skills:documentation-and-adrs` — migration run-log is an ADR itself.
- `andrej-karpathy-skills:karpathy-guidelines` — surgical migration. No orthogonal "cleanup."

#### PR 7 — Lifecycle (decay, supersession, lint, consolidate)
- `agent-skills:performance-optimization` — decay pass over 10k+ pages must complete in <10s (budget).
- `agent-skills:api-and-interface-design` — lint output schema is stable; consumed by dashboards.
- `compound-engineering:ce-optimize` — empirical tuning of decay λ, retention tier thresholds.

#### PR 8 — Auto-triggers + observability + docs
- `agent-skills:ci-cd-and-automation` — add `fulcrum memory eval` to CI as a required gate.
- `agent-skills:shipping-and-launch` — pre-launch checklist; rollback plan; monitoring.
- `agent-skills:documentation-and-adrs` — `docs/architecture/memory-v3.md` ships here.
- `compound-engineering:onboarding` — update ONBOARDING.md memory section once more with the full shipped surface.
- `compound-engineering:ce-demo-reel` — capture a GIF demo of ingest → curate → recall → mark-wrong → re-curate for the PR body.

#### PR 9 — Cleanup
- `agent-skills:code-simplification` + `compound-engineering:code-simplify` — the whole purpose of this PR.
- `compound-engineering:git-clean-gone-branches` — after merge, clean up the feature branches.

### Subagent delegation (cross-PR)

Some work naturally parallelizes across subagents; the orchestrator delegates to the listed specialist rather than doing it inline:

| Work | Subagent | When |
|---|---|---|
| Adversarial spec review | `compound-engineering:document-review:adversarial-document-reviewer` | PR 0 |
| Coherence review | `compound-engineering:document-review:coherence-reviewer` | PR 0 |
| Feasibility review | `compound-engineering:document-review:feasibility-reviewer` | PR 0 |
| Scope-guardian review | `compound-engineering:document-review:scope-guardian-reviewer` | PR 0 |
| Security-lens review | `compound-engineering:document-review:security-lens-reviewer` | PR 0, PR 6 |
| Architecture reviewer | `Architecture Reviewer` | PR 2, PR 5, PR 6 |
| Security auditor | `agent-skills:security-auditor` | PR 3 (curator input), PR 6 (rollback), PR 8 (exposed endpoints) |
| Test engineer | `agent-skills:test-engineer` | PR 2 (validator tests), PR 5 (eval corpus), PR 6 (migration tests) |
| Correctness reviewer | `compound-engineering:review:correctness-reviewer` | pre-merge on every PR |
| Adversarial code reviewer | `compound-engineering:review:adversarial-reviewer` | PR 3, PR 5, PR 6 (diffs touch untrusted input / data mutations) |
| Performance reviewer | `compound-engineering:review:performance-reviewer` | PR 4, PR 5, PR 7 |
| Data integrity guardian | `compound-engineering:review:data-integrity-guardian` | PR 0 (schema), PR 6 (migration) |
| Codex rescue (when stuck) | `codex:codex-rescue` | any PR — triggered when an approach has failed twice |

### Skills explicitly NOT used here (and why)

| Skill | Why not |
|---|---|
| `compound-engineering:frontend-design` / `frontend-ui-engineering` | No UI in this plan. |
| `browser-testing-with-devtools` / `playwright-cli` / `test-browser` / `agent-browser` | No browser surface. |
| `tavily-*` | Web research handled by `find-docs` / `WebSearch`; Tavily not needed. |
| `compound-engineering:dhh-rails-style` / `andrew-kane-gem-writer` / `dspy-ruby` / `every-style-editor` (code form) / `gemini-imagegen` / `proof` | Wrong stack / domain. |
| `compound-engineering:ce-slack-research` | No Slack context relevant to memory architecture decisions. |
| `superpowers-developing-for-claude-code:*` | This is Fulcrum, not a Claude Code plugin project. |
| `claude-session-driver:driving-claude-code-sessions` | Orchestrator is the user + single agent, not a PM-over-sessions setup. |

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

- **ADR — extend existing `graph_entities` / `graph_edges`, do not replace.** Both tables already exist in `packages/core/src/db/schema.ts` (lines 996–1025) with a superset-shape: `graph_entities(entity_id, workspace_id, name, entity_type, properties, valid_from, valid_until, created_at, updated_at)` and `graph_edges(edge_id, workspace_id, source_id, target_id, relation, weight, properties, valid_from, valid_until, created_at)`. Renaming columns in SQLite requires a full table rebuild; v3 adopts the existing names and adds the missing semantic columns via guarded `ALTER TABLE ADD COLUMN`. The mapping:

  | v3 plan name | physical column | notes |
  |---|---|---|
  | `type` | `entity_type` | existing; no rename |
  | `attributes` | `properties` | existing; no rename |
  | `from_id` | `source_id` | existing; no rename |
  | `to_id` | `target_id` | existing; no rename |
  | `rel_type` | `relation` | existing; no rename |
  | `aliases` | `aliases` | **NEW** — JSON array, nullable |
  | `confidence` (entity) | `confidence` | **NEW** — `REAL NOT NULL DEFAULT 1.0` |
  | `first_seen` | `first_seen` | **NEW** — ISO text, nullable initially; PR 6 backfills from `created_at` |
  | `last_confirmed` | `last_confirmed` | **NEW** — ISO text, nullable initially |
  | `confidence` (edge) | `confidence` | **NEW** — `REAL NOT NULL DEFAULT 1.0`; complements existing `weight` (kept for legacy callers) |
  | `source_ids` | `source_ids` | **NEW** — JSON array of `l0_sources.source_id`, nullable |

  Target shape **after** `runMigration101MemoryV3Lifecycle`:
  ```sql
  -- graph_entities (existing + 4 new columns)
  graph_entities(
    entity_id      TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    name           TEXT NOT NULL,
    entity_type    TEXT NOT NULL,                 -- v3 "type"
    properties     TEXT NOT NULL DEFAULT '{}',    -- v3 "attributes"
    valid_from     TEXT,                          -- existing bitemporal
    valid_until    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    -- v3 additions:
    aliases        TEXT,                          -- JSON array
    confidence     REAL NOT NULL DEFAULT 1.0,
    first_seen     TEXT,                          -- ISO, nullable pre-cutover
    last_confirmed TEXT                           -- ISO, nullable pre-cutover
  );

  -- graph_edges (existing + 2 new columns)
  graph_edges(
    edge_id        TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    source_id      TEXT NOT NULL REFERENCES graph_entities(entity_id),  -- v3 "from_id"
    target_id      TEXT NOT NULL REFERENCES graph_entities(entity_id),  -- v3 "to_id"
    relation       TEXT NOT NULL,                                       -- v3 "rel_type"
    weight         REAL NOT NULL DEFAULT 1.0,                           -- legacy, kept
    properties     TEXT NOT NULL DEFAULT '{}',
    valid_from     TEXT,
    valid_until    TEXT,
    created_at     TEXT NOT NULL,
    -- v3 additions:
    confidence     REAL NOT NULL DEFAULT 1.0,
    source_ids     TEXT                                                 -- JSON array of l0_sources.source_id
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
  2. `codex` CLI on PATH + authenticated → spawn `codex exec --model <model> -c model_reasoning_effort=<effort> --json --output-schema=<schema.json>`. Uses the user's ChatGPT Plus/Pro subscription — zero marginal cost for subscribers.
  3. `pi` CLI on PATH → spawn `pi run --model <model> --json --output-schema=<schema.json>`. Same ChatGPT auth via pi's own handoff.
  4. `OPENAI_API_KEY` set → direct API call with Structured Outputs (`response_format: { type: 'json_schema', strict: true }`).
  5. `ANTHROPIC_API_KEY` set → Claude Haiku via API.
  6. None of the above → `fulcrum memory curate` fails loudly with install instructions; L0 ingestion continues to work so no data is lost — only curation is paused.

- **Model + reasoning pinned per curator task** (applies to every backend; defaults to these values, env-overridable):

  | Curator task | Model | Reasoning effort | Why |
  |---|---|---|---|
  | L0 → L1 extraction (the 95% case) | `gpt-5-mini` | `minimal` | Curator schema has multi-array shapes with conditional logic (contradiction → supersession) and L0 inputs are messy (raw bash output, diffs, session transcripts). Nano's documented sweet spot is 3-4 flat fields with clean inputs — it drops fields on complex schemas. Mini is documented as "high fidelity on messy/ambiguous inputs." Minimal reasoning skips chain-of-thought for a mechanical extraction task while preserving instruction-following. |
  | Consolidation (merge already-structured L1 pages) | `gpt-5-nano` | `minimal` | Simpler task, clean inputs (the L1 page frontmatter + body). Nano fits. |
  | Synthesis (cross-source analyses, multi-hop connections) | `gpt-5` | `medium` | Real reasoning needed. Rarely used; invoked explicitly via `fulcrum memory synthesize --pages <ids>`. |

  Env overrides: `FULCRUM_CURATOR_MODEL`, `FULCRUM_CURATOR_REASONING`, with per-task variants `FULCRUM_CURATOR_MODEL_EXTRACTION`, `FULCRUM_CURATOR_MODEL_CONSOLIDATION`, `FULCRUM_CURATOR_MODEL_SYNTHESIS`.

- **Why subprocess over direct API when subscription is present:** A ChatGPT Pro plan's 20x multiplier makes backfilling 1k-10k historical memories cost nothing on top of the monthly fee. Direct API would bill separately — small absolute numbers (~$5-$10 one-time backfill, ~$0.0005/memory ongoing at Nano rates), but it's a second billing relationship users must set up. Subscription reuse wins on UX even when the dollar delta is small.
- **API fallback model choice:** same pinning as codex path. Structured Outputs (`strict: true`) GUARANTEE schema conformance at the token-generation level via GPT-5.2+'s CFG engine. Batch API (50% off, async within 24h) used for Phase 6 one-time backfill.
- **Backend abstraction:** `l1/curator-backend/{codex,pi,openai,anthropic}.ts` implement a common `curate(l0_source, schema, task) → ParsedCuratorOutput` interface where `task` picks the model+reasoning row above. Tests stub the interface; integration tests rotate through real backends in a smoke matrix.

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
- **Every recall result carries L0 back-refs.** Each returned L1 page includes its `sources[]` (L0 IDs) and an `l0_wikilinks[]` array parsed from the body, so both CLI and MCP callers can drill straight into raw.

### Guided templates + L0 traceability (HARD constraint)

- **Every L1 page is written from a template.** Curator prompts include the template verbatim; post-curator validator rejects malformed output. Templates live at `packages/memory/src/l1/templates/{entity,concept,page,synthesis}.template.md` and are the single source of truth for page shape.
- **Every L1 claim carries a wikilink back to its L0 source(s).** Obsidian-style `[[l0/raw/<source_type>/<yyyy>/<mm>/<dd>/<ULID>]]` inline in the body wherever a claim is grounded, PLUS a `sources:` array in frontmatter for the global list. Redundant by design — inline links show which sentence came from which dump; the frontmatter array is for O(1) enumeration + graph traversal.
- **Why both formats:** inline wikilinks let humans click-through in Obsidian to audit any specific claim; the `sources:` array lets the system answer "give me all L0 dumps behind page X" without parsing markdown. Lint catches divergence (frontmatter lists a source not referenced inline, or vice versa).
- **Filename discipline:** L0 files are ULID-named under `raw/<type>/<yyyy>/<mm>/<dd>/<ULID>.md`. L1 wikilinks reference the path-relative-to-vault form: `[[raw/bash_trace/2026/04/18/01KPGHE...]]`. Obsidian resolves via its vault config; CLI tooling resolves via `vaultRoot + '/' + linkTarget + '.md'`.
- **Template-level guarantees (enforced by curator validator):**
  1. Frontmatter `sources: [<L0_ULID>...]` non-empty (except for `type: concept` pages that can be cross-source syntheses — those carry `sources_via: [<L1_page_id>...]` instead, which transitively resolve to L0).
  2. Body contains at least one `[[raw/...]]` wikilink that matches a `sources[]` entry.
  3. `confidence` field present and in `[0.0, 1.0]`.
  4. No placeholder text (`TODO`, `FIXME`, `...`, `XXX`) in the body.
  5. `entities[]` in frontmatter references only existing `graph_entities` rows.

- **Operator + agent inspection paths:**

  | User / agent need | CLI | MCP tool |
  |---|---|---|
  | Show an L1 page with full body + frontmatter | `fulcrum memory inspect <page_id>` | `mcp__fulcrum__inspect_memory` |
  | Walk L1 → L0 sources (returns L0 IDs + snippets) | `fulcrum memory sources <page_id>` | `mcp__fulcrum__get_memory_sources` |
  | Read a specific L0 raw file | `fulcrum memory read-raw <l0_id>` | `mcp__fulcrum__read_raw_source` |
  | Find which L1 page(s) contain a given claim | `fulcrum memory trace "<claim text>"` | `mcp__fulcrum__trace_claim` |
  | Mark an L1 page wrong / request re-curation | `fulcrum memory mark-wrong <page_id> --reason "..."` | `mcp__fulcrum__mark_memory_wrong` |
  | Edit an L1 page directly (manual correction) | Open the `.md` file; vault watcher re-indexes + optionally re-runs curator | (via filesystem; agents can use the Edit tool then call `mcp__fulcrum__reindex_memory`) |

- **Mark-wrong workflow:** user hits a bad recall → `fulcrum memory mark-wrong <page_id> --reason "fact X is wrong, see L0 source Y"` → system appends a correction L0 entry under `raw/correction/...` → triggers curator re-run with a prompt that includes the correction → curator supersedes the old page with a corrected version. Audit chain preserved in `log.md`.

- **Why this matters beyond theoretical correctness:** during the 2026-04-18 debugging session the user found a truncated vault file and had no path from "this page looks wrong" to "here's the raw source and here's the line in L0 that the extractor misread." This redesign makes that path a one-command operation for both humans and agents.

### Migration strategy

- **No big-bang rewrite.** Each phase ships behind a feature flag and coexists with the current code path until verified.
  - Phase 0 writes the spec + schema migration functions (TS constants + ledger-guarded `runMigration10X*` functions; no runtime call sites wired until PR 1).
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
5. **CLI-first primary; MCP overlay.** `fulcrum memory ingest`, `fulcrum memory curate`, `fulcrum memory lint`, `fulcrum memory consolidate`, `fulcrum memory sources`, `fulcrum memory inspect`, `fulcrum memory read-raw`, `fulcrum memory trace`, `fulcrum memory mark-wrong`, `fulcrum memory export`, `fulcrum memory synthesize` — every capability reachable via `fulcrum action exec`. MCP tools are thin shims.
6. **Control-plane features are dormant, not absent.** Curator auto-trigger and consolidation pass are opt-in (`FULCRUM_MEMORY_CURATE_AUTO=1`, `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE=...`). Default install = manual operation.
7. **No confidence hallucination.** Confidence values come from observed evidence (source counts, reinforcement, explicit caller overrides). Never LLM-generated without grounding in L0 sources.
8. **Agent-native parity.** Every action a user can take (ingest, curate, lint, consolidate, query, inspect, trace, mark-wrong, read-raw) an agent can also take via MCP / CLI.
9. **L0 traceability (HARD).** Every L1 page MUST have (a) a non-empty `sources[]` in frontmatter referencing one or more L0 ULIDs, AND (b) at least one inline `[[raw/...]]` wikilink in the body matching one of those sources. Synthesis pages that derive only from other L1 pages use `sources_via: [<l1_page_id>...]` which transitively resolve to L0. Validator enforces on every write. Lint catches drift in already-stored pages.
10. **Guided templates (HARD).** All L1 pages are written from templates at `packages/memory/src/l1/templates/`. Curator prompts include the template verbatim; post-curator validator rejects malformed output with a structured `L1TemplateViolationError`. No free-form page writes.
11. **Loopback-only** (existing).
12. **Reversible migrations.** Every schema migration has a documented rollback SQL. The Phase 6 one-time data migration runs in a transaction with an abort-and-restore path.
13. **Mark-wrong is role-gated (HARD).** `mcp__fulcrum__mark_memory_wrong` and `fulcrum memory mark-wrong` are restricted to role `chief_of_staff` (or a future `memory_curator` role). `software_engineer` / `test_engineer` / other implementation roles CANNOT mark pages wrong — they can only read via `inspect_memory`, `get_memory_sources`, `read_raw_source`, `trace_claim`. Rationale: the `correction` L0 entries are re-fed to the curator as trusted evidence; unrestricted mark-wrong is a curator-steering attack surface. Enforcement: policy rule checked in `mark_memory_wrong` action handler before the correction L0 is written.
14. **Correction L0 entries carry a distinct trust tier.** `source_type='correction'` entries are delimited in the curator prompt as `<AGENT_CORRECTION>` (not `<USER_CONTENT>`) and the prompt instructs the model to treat them as *claims to be verified against the original L0*, not as ground truth. Curator output that supersedes a page based ONLY on a correction (no reinforcing evidence from other L0 sources) is flagged and routed to a human reviewer via a `Review` record.
15. **Post-curator semantic allowlist (HARD).** Curator output is rejected by the validator if any `new_pages[].sources[]` entry references an L0 ULID not present in the current curation batch input. Delimiter isolation (`<USER_CONTENT>`) prevents prompt-level injection; this allowlist blocks schema-conformant injection attacks where a crafted L0 body biases the model into fabricating `sources[]` ULIDs that don't exist in the input. Enforcement lives in `l1/validator.ts`; curator output failing this check is rejected before any L1 write.
16. **Secrets handling (HARD).** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `codex` / `pi` subscription tokens are:
    - Read from env or OS keychain only; never from project-local files.
    - Never logged. Error paths from any backend (`l1/curator-backend/*.ts`) redact credential-shaped substrings before writing to `vault/curated/log.md`, `worktree_events`, or stderr.
    - Never stored in any `*_json` column (curator run logs, provenance, event payloads).
    - Rotation: subscribers are responsible; Fulcrum does not store credentials persistently.
17. **Rollback binary is operator-only with technical enforcement (HARD).** `fulcrum memory rollback --to v2` refuses to run unless BOTH: (a) stdout is a TTY (`process.stdout.isTTY === true`), AND (b) `FULCRUM_OPERATOR_CONFIRM=<uuid>` env var is set to a UUID the operator generated and pasted. The UUID is consumed (marked used in a local record) so the same value can't be replayed. The command prints the consumed UUID on exit for audit. `fulcrum action exec` refuses to invoke `memory.rollback`; MCP surface does not register a rollback tool.

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
    curator-backend/
      codex.ts                              — NEW: codex exec subprocess backend
      pi.ts                                 — NEW: pi CLI subprocess backend
      openai.ts                             — NEW: OpenAI API Structured Outputs fallback
      anthropic.ts                          — NEW: Anthropic API fallback
    page.ts                                 — NEW: create/update/supersede curated pages (template-validated)
    validator.ts                            — NEW: L1 template + wikilink + frontmatter rules
    wikilinks.ts                            — NEW: parse/emit/resolve Obsidian-style [[path]] refs
    templates/
      entity.template.md                    — NEW: entity page template
      concept.template.md                   — NEW: concept page template
      page.template.md                      — NEW: source-summary page template
      synthesis.template.md                 — NEW: cross-source synthesis template
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

packages/memory/src/
  schema.ts                                 — NEW: memory v3 migration functions
                                              (mirrors packages/teams/src/schema.ts +
                                              packages/workflows/src/schema.ts pattern —
                                              template-string DDL + ledger-guarded
                                              `runMigration10X*` TS fns, no .sql files)
    runMigration101MemoryV3Lifecycle()      — alter memories; update/extend graph tables;
                                              add l0_sources, l1_pages
    runMigration102MemoryV3SourceIndex()    — indexes on new columns
    runMigration103MemoryV3Cutover()        — Phase 5 cutover (nullable → NOT NULL)
    runMigration104MemoryV3DropCanonicalText() — drop memories.canonical_text; FTS5
                                                 trigger reads content directly

packages/cli/src/commands/
  memory/
    ingest.ts                               — NEW: fulcrum memory ingest <source_type> < body
    curate.ts                               — NEW: fulcrum memory curate [--all | <l0_id>]
    lint.ts                                 — NEW: fulcrum memory lint
    consolidate.ts                          — NEW: fulcrum memory consolidate
    sources.ts                              — NEW: fulcrum memory sources <l1_page_id>
    inspect.ts                              — NEW: fulcrum memory inspect <l1_page_id>
    read-raw.ts                             — NEW: fulcrum memory read-raw <l0_id>
    trace.ts                                — NEW: fulcrum memory trace "<claim>"
    mark-wrong.ts                           — NEW: fulcrum memory mark-wrong <l1_page_id> --reason
    export.ts                               — NEW: fulcrum memory export (audit dump)
    page.ts                                 — NEW: fulcrum memory page create|show (template scaffolding)
    synthesize.ts                           — NEW: fulcrum memory synthesize --pages <ids>...

docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md
                                            — this file

agent-integration/skills/fulcrum/
  l0-ingest.md                              — NEW: guidance for agents writing L0
  l1-curate.md                              — NEW: curator prompt template + examples
  l1-lint.md                                — NEW: lint pass rubric
```

---

## Template reference (concrete shapes)

These are the normative shapes validated by `l1/validator.ts`. Curator prompts include them verbatim. Placeholders in `{{...}}` are filled by the curator; the validator rejects any page with unfilled placeholders.

### Entity template (`l1/templates/entity.template.md`)

```markdown
---
id: {{ULID}}
schema: fulcrum.memory/v3
type: entity
entity_type: {{library|person|project|file|symbol|decision|concept}}
name: {{NAME}}
aliases: {{ALIAS_ARRAY}}
confidence: {{CONFIDENCE}}           # 0.0–1.0
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
sources:                              # REQUIRED: ≥1 L0 ULID
  - {{L0_ULID_1}}
supersedes: []
superseded_by: null
retention_tier: working               # working|episodic|semantic|procedural
access_count: 0
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{NAME}}

{{ONE_LINE_DESCRIPTION}}

## Observed usage

{{PROSE_DESCRIBING_HOW_THIS_ENTITY_APPEARS_IN_SOURCES}}

Sources grounding the claims above:
- [[raw/{{SOURCE_TYPE_1}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID_1}}]]

## Related

- [[entity/{{RELATED_ENTITY_ULID}}]]
```

### Concept template (`l1/templates/concept.template.md`)

```markdown
---
id: {{ULID}}
schema: fulcrum.memory/v3
type: concept
name: {{NAME}}
confidence: {{CONFIDENCE}}
sources: {{L0_ULID_ARRAY}}            # REQUIRED (or sources_via for cross-L1)
sources_via: []
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: working
access_count: 0
supersedes: []
superseded_by: null
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{NAME}}

{{ONE_PARAGRAPH_DEFINITION}}

## Evidence

{{PROSE_WITH_INLINE_WIKILINKS}}
Example: "The invariant was established in [[raw/decision/2026/04/18/{{ULID}}]]
after [[raw/session_transcript/2026/04/17/{{ULID}}]] showed a regression."

## Implementation references

- `{{FILE_PATH}}:{{LINE}}` — {{CONTEXT}}
```

### Source-summary page template (`l1/templates/page.template.md`)

```markdown
---
id: {{ULID}}
schema: fulcrum.memory/v3
type: page
title: {{TITLE}}
source: {{L0_ULID}}                   # the primary L0 this page distills
sources: [{{L0_ULID}}]                # same as above for consistency; may include ancillaries
confidence: 1.0
entities: {{ENTITY_ULID_ARRAY}}
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: working
access_count: 0
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{TITLE}}

Distilled from [[raw/{{SOURCE_TYPE}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID}}]].

## Summary

{{2_4_SENTENCE_SUMMARY}}

## Key points

- {{POINT_1}} — see [[raw/.../{{L0_ULID}}]]
- {{POINT_2}}

## Entities mentioned

- [[entity/{{ENTITY_ULID_1}}]]
```

### Synthesis template (`l1/templates/synthesis.template.md`)

```markdown
---
id: {{ULID}}
schema: fulcrum.memory/v3
type: synthesis
title: {{TITLE}}
sources: []                           # may be empty
sources_via:                          # REQUIRED when sources[] empty
  - {{L1_PAGE_ULID_1}}
  - {{L1_PAGE_ULID_2}}
confidence: {{CONFIDENCE}}
first_seen: {{ISO_TIMESTAMP}}
last_confirmed: {{ISO_TIMESTAMP}}
retention_tier: episodic
access_count: 0
supersedes: []
superseded_by: null
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
---

# {{TITLE}}

{{INTRODUCTION_TYING_SOURCES_TOGETHER}}

## Pattern

{{DISCOVERED_PATTERN}}

## Evidence

- [[page/{{L1_PAGE_ULID_1}}]] — {{CONTRIBUTION}}
- [[page/{{L1_PAGE_ULID_2}}]] — {{CONTRIBUTION}}

## Transitive L0 sources

Followed from the L1 pages above:
- [[raw/{{SOURCE_TYPE}}/{{YYYY}}/{{MM}}/{{DD}}/{{L0_ULID}}]]
```

### L0 raw-source frontmatter (minimal, set by `ingestRawSource`)

```markdown
---
id: {{ULID}}
schema: fulcrum.source/v3
source_type: {{bash_trace|tool_trace|file_patch|session_transcript|prompt_attachment|web_capture|edit_diff|correction}}
session_id: {{SESSION_ID}}
workspace_id: {{WORKSPACE_ID}}
project_id: {{PROJECT_ID}}
cwd: {{ABS_PATH}}
created_at: {{ISO_TIMESTAMP}}
content_hash: {{SHA256_64_HEX}}
size_bytes: {{N}}
---

{{FULL_VERBATIM_BODY}}
```

No truncation, no canonical_text, no normalization. Body = what was captured.

---

## Phased Rollout (PRs)

Every PR ends with CI-green tests + a one-line migration note in `CHANGELOG.md`. Flag-gated where noted. **No PR exceeds ~500 diff lines.** If a unit would cross that bar, it gets split.

### PR 0 — Spec + schema scaffolding

**Goal:** land the spec doc (this file), write the migration functions, update `CHANGELOG.md`. No runtime call sites wired; the migration functions exist as code but nothing calls them yet (wiring happens in PR 1).

**Migration convention (REQUIRED READING).** This repo has **no `.sql` files**. The live convention (see `packages/teams/src/schema.ts:runMigration006Teams()` and `packages/workflows/src/schema.ts:runMigration007Workflows()`) is:
1. DDL lives as a template-string constant inside a `schema.ts` in the owning package.
2. A `runMigrationNNNName(db)` function `db.exec()`s the DDL (idempotent — `CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info` guards around `ALTER TABLE ADD COLUMN`).
3. Function records a ledger row via `INSERT OR IGNORE INTO schema_migrations(name) VALUES ('NNN_name')`.
4. Historical `m001..m052` core migrations were consolidated into `applySchema()`; `recordLegacyMigrationNames()` back-fills their names so old tests still match the ledger.
5. Memory v3 takes numbers `101..104` to leave unambiguous headroom above both the consolidated block (≤ 052) and extension packages (teams=006, workflows=007).
6. Rollback SQL for each migration is documented as a comment block **above** the forward DDL in the same TS file — not a separate artifact.

**Units:**

- **0.1** This plan doc committed to `docs/plans/`.
- **0.2** `packages/memory/src/schema.ts` — new file. Exports `runMigration101MemoryV3Lifecycle(db)` which performs, idempotently and in order:
  1. **Extend `memories`** with 4 new columns via `PRAGMA table_info`-guarded `ALTER TABLE ADD COLUMN` (all nullable pre-cutover):
     - `retention_tier TEXT` — app-validated: `working|episodic|semantic|procedural`
     - `confidence_decay_at TEXT` — ISO timestamp, last time decay was computed
     - `superseded_by TEXT` — `memory_id` of successor (scalar; existing `supersedes` column keeps its TEXT type and holds the JSON array of predecessors)
     - `consolidated_from_ids TEXT` — JSON array of `memory_id`s merged into this row
  2. **Extend `graph_entities`** with 4 new columns via the same guarded pattern (see §Knowledge graph for the full target shape):
     - `aliases TEXT`, `confidence REAL NOT NULL DEFAULT 1.0`, `first_seen TEXT`, `last_confirmed TEXT`
  3. **Extend `graph_edges`** with 2 new columns:
     - `confidence REAL NOT NULL DEFAULT 1.0`, `source_ids TEXT`
  4. **Create new table `l0_sources`**. No CHECK on `source_type` — app-layer validation per v2a precedent.
     ```sql
     CREATE TABLE IF NOT EXISTS l0_sources (
       source_id     TEXT PRIMARY KEY,                                          -- ULID
       source_type   TEXT NOT NULL,                                             -- bash_trace|tool_trace|file_patch|
                                                                                --   session_transcript|prompt_attachment|
                                                                                --   web_capture|edit_diff|correction
       session_id    TEXT,                                                      -- agent_runs.run_id when known
       workspace_id  TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
       project_id    TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
       cwd           TEXT,                                                      -- absolute path at ingest time
       vault_path    TEXT NOT NULL,                                             -- 'raw/<type>/YYYY/MM/DD/<ULID>.md'
       content_hash  TEXT NOT NULL,                                             -- sha256 hex
       size_bytes    INTEGER NOT NULL,
       created_at    TEXT NOT NULL DEFAULT (datetime('now'))
     );
     ```
  5. **Create view `l1_pages`** — read-only projection of `memories` filtered to v3 rows. Writes go directly to `memories`; the view is never written.
     ```sql
     CREATE VIEW IF NOT EXISTS l1_pages AS
     SELECT
       memory_id            AS page_id,
       kind                 AS page_type,       -- entity|concept|page|synthesis (app-validated)
       workspace_id, project_id, title, summary,
       content              AS body,
       confidence, retention_tier, access_count,
       slug, vault_path,
       content_hash         AS body_hash,
       entities, provenance,                    -- provenance.sources[] carries L0 refs
       supersedes, superseded_by, consolidated_from_ids,
       confidence_decay_at, embedded, schema_version,
       created_at           AS first_seen,
       updated_at           AS last_confirmed,
       last_accessed_at, last_recalled_at,
       recall_count, unique_query_count, max_recall_score
     FROM memories
     WHERE schema_version >= 3;
     ```
  6. Writes ledger row `101_memory_v3_lifecycle` via `INSERT OR IGNORE INTO schema_migrations(name)`.

  Rollback SQL lives as a comment block above the forward DDL in the same TS file. Does not wire a call site into any runtime path; that happens in PR 1 unit 1.1.

- **0.3** Same file — exports `runMigration102MemoryV3SourceIndex(db)`: indexes on the new columns, all partial/guarded for sparse data. Minimum set:
  - `idx_l0_sources_ws_project (workspace_id, project_id)`, `idx_l0_sources_type (source_type)`, `idx_l0_sources_session (session_id) WHERE session_id IS NOT NULL`, `idx_l0_sources_hash (content_hash)`, `idx_l0_sources_created (created_at)`
  - `idx_memories_retention_tier (retention_tier) WHERE retention_tier IS NOT NULL`, `idx_memories_superseded_by (superseded_by) WHERE superseded_by IS NOT NULL`, `idx_memories_decay (confidence_decay_at) WHERE confidence_decay_at IS NOT NULL`
  - `idx_graph_entities_confidence (confidence)`, `idx_graph_entities_last_confirmed (last_confirmed) WHERE last_confirmed IS NOT NULL`
  - `idx_graph_edges_confidence (confidence)`

  Writes ledger row `102_memory_v3_source_index`.
- **0.4** `packages/memory/src/l0/types.ts` — TypeScript types only (no runtime code yet).
- **0.5** Update `AGENTS.md` + `agent-integration/claude/CLAUDE.md` with a "Memory tiers (v3 draft)" section.

**Verify:** `pnpm build` typechecks clean; `pnpm -F @fulcrum/memory test` passes the new migration test (fresh in-memory DB → run 101 + 102 → assert new columns present via `PRAGMA table_info`, ledger rows present via `SELECT name FROM schema_migrations WHERE name IN (...)`); `pnpm test` at root unchanged; idempotency test re-runs both functions and confirms no throw + no duplicate ledger rows.

### PR 1 — L0 raw-ingest + vault path split

**Goal:** new writes go to `vault/raw/`, no truncation, no sanitization-rewrite-in-place. Old path still runs for anything that hasn't switched yet.

**Units:**

- **1.1** `l0/ingest.ts` exports `ingestRawSource({ source_type, body, meta }) → L0File`. Writes `vault/raw/{source_type}/yyyy/mm/dd/{ULID}.md`. Frontmatter minimal. Inserts `l0_sources` row. Emits bus event.
  - **Skills:** `agent-skills:api-and-interface-design` (public contract — every downstream consumer depends on this signature), `agent-skills:source-driven-development` + `find-docs` (verify Node `fs.writeFileSync` / `mkdirSync` recursive + mode flags against current docs), `agent-skills:security-and-hardening` (0600 perm regression for L0 files; inherits `globalDataDir()` perms).
- **1.2** `vault/client.ts` — split `writeMemoryFile` into `writeRawFile` + `writeCuratedFile`. Old function kept as back-compat wrapper routing to curated until PR 2 cutover.
  - **Skills:** `agent-skills:api-and-interface-design` (keep v1 callers working via the shim).
- **1.3** `vault/watcher.ts` — watch both `raw/` and `curated/` roots, emit distinct `raw-change` and `curated-change` events.
  - **Skills:** `find-docs` on chokidar current API; `compound-engineering:review:reliability-reviewer` pre-merge (watcher lifecycle, rebinding on rename).
- **1.4** `packages/cli/src/hooks.ts` — `runPostHook` file_patch / bash_trace branches call `ingestRawSource` (full body, no slice). Flag-gated on `FULCRUM_MEMORY_V3=1` so prod stays on the old path until PR 5.
- **1.5** Regression tests: raw dump of 10 KB bash command lands verbatim; L0 file round-trips through WAL audit; old write path (flag off) unchanged.

**Verify:** `FULCRUM_MEMORY_V3=1 pnpm -F fulcrum-memory test src/tests/l0-ingest.test.ts`; manual e2e: `fulcrum hook claude post` with long heredoc → check vault/raw/bash_trace/ for verbatim body.
**Pre-merge skills:** `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:security-reviewer` (file perms + hook surface), `compound-engineering:review:project-standards-reviewer`.

### PR 2 — L1 curated page primitives + templates + validator

**Goal:** create/update/read L1 pages programmatically. Curator logic deferred to PR 3. Templates + validator land here so everything downstream consumes a validated page shape.

**Units:**

- **2.1** `l1/templates/{entity,concept,page,synthesis}.template.md` — canonical markdown templates with placeholder tokens (`{{ULID}}`, `{{NAME}}`, `{{SOURCE_ULID}}`, etc.). Templates are human-editable; the validator reads them at module load to derive required fields + structural rules.
- **2.2** `l1/page.ts` — `createCuratedPage(template, vars)`, `updateCuratedPage`, `supersedeCuratedPage`, `readCuratedPage`. Every `create/update` runs through `validateL1Page(page)` before write; invalid pages throw `L1TemplateViolationError` listing each failed rule.
- **2.3** `l1/validator.ts` — enforces the template-level guarantees from §Guided templates:
  1. Required frontmatter fields present (`id`, `schema`, `type`, `confidence`, `sources` or `sources_via`, etc.)
  2. `confidence ∈ [0.0, 1.0]`
  3. For `type ∈ {entity, page, synthesis}`: `sources[]` non-empty
  4. Body contains at least one `[[raw/...]]` wikilink matching a `sources[]` entry
  5. No placeholder tokens (`TODO`, `FIXME`, `{{...}}`) remain
  6. Every `entities[]` ULID exists in `graph_entities`
  7. Every `supersedes[]` page_id in a **v3 page** (schema_version ≥ 3) must exist in the `l1_pages` view (i.e. resolves to a `memories` row with `schema_version >= 3`). **This rule is waived during Phase 6 migration** (pre-cutover pages may supersede rows that haven't been bumped to schema_version 3 yet); the rule is enforced starting at Phase 6.5 lint pass.
  - **Skills:** `agent-skills:api-and-interface-design` (error codes are a public surface — stable contract), `agent-skills:test-engineer` (subagent; exhaustive rule-violation test corpus), `compound-engineering:review:testing-reviewer` pre-merge.
- **2.4** `l1/wikilinks.ts` — parse + emit Obsidian-style `[[path]]` references. Functions: `extractWikilinks(body) → string[]`, `renderWikilink(l0_file) → string`, `resolveWikilink(link, vaultRoot) → absolute path`. Tests cover nested paths, special chars, escaping.
- **2.5** `l1/entities.ts` — `upsertEntity`, `addEdge`, `getEntityGraph(entity_id, depth)`. SQLite-backed. Kuzu optional mirror in later phase.
- **2.6** Page frontmatter serializer: structured YAML with list fields (`sources`, `supersedes`, `entities`), preserves round-trip through `readMemoryFile`.
- **2.7** CLI stub: `fulcrum memory page create --template <name>` shows the rendered template for operator debugging + manual authoring. Not surfaced in MCP until PR 3.
- **2.8** Unit tests: template → create → read round-trip; validator rejects each of the 7 failure modes; wikilink parser covers edge cases; supersession chain; graph traversal 2-hop.

**Verify:** `pnpm -F fulcrum-memory test src/tests/l1-page.test.ts`; `fulcrum memory page create --template entity --name React → fulcrum memory page show <id>` displays the rendered page with live L0 wikilinks.

### PR 3 — Curator pipeline (manual trigger)

**Goal:** `fulcrum memory curate <l0_id>` reads an L0 source, runs curator prompt through the auto-selected backend, applies structured edits to L1. No auto-trigger yet.

**Units:**

- **3.1** `l1/curator.ts` — prompt template + structured-output parser + backend dispatcher. Selects inference backend per §L0→L1 curation pipeline rules (env override > codex > pi > openai > anthropic).
  - **Skills (load-bearing):** `codex:gpt-5-4-prompting` — composes every curator prompt before any code is written. Without this skill the prompt is guesswork. Also: `compound-engineering:agent-native-architecture` (backend selection is agent-facing), `agent-skills:security-and-hardening` (L0 body is untrusted — isolate via `<USER_CONTENT>` delimiter per `codex:gpt-5-4-prompting` guidance).
- **3.2** `l1/curator-backend/codex.ts` — spawns `codex exec --model <task_model> -c model_reasoning_effort=<task_effort> --json --output-schema=<path>` with L0 body on stdin, streams JSONL events, captures the final schema-constrained JSON. Handles exit codes + stderr propagation. Per-task defaults: extraction = `gpt-5-mini` + `minimal`; consolidation = `gpt-5-nano` + `minimal`; synthesis = `gpt-5` + `medium`. Primary backend when user is on a ChatGPT Plus/Pro plan.
  - **Skills:** `codex:codex-cli-runtime` (subprocess contract — handles exit codes, stdout/stderr separation, JSONL framing), `codex:codex-result-handling` (parse the JSONL event stream into `{new_pages, updates, supersessions, new_edges}`; validate against schema).
- **3.3** `l1/curator-backend/pi.ts` — same interface for pi CLI (stub in PR 3, filled when pi's non-interactive mode stabilizes). Same per-task model pinning.
- **3.4** `l1/curator-backend/openai.ts` — direct OpenAI API call with `response_format: { type: 'json_schema', strict: true }`. Same per-task model pinning as codex backend. Used in CI / headless / users without codex.
  - **Skills:** `agent-skills:source-driven-development` + `find-docs` (verify Structured Outputs current spec + `strict: true` semantics), `agent-skills:security-and-hardening` (OPENAI_API_KEY handling — never logged).
- **3.5** Deterministic apply-layer: takes the curator's JSON output `{ new_pages, updates, supersessions, new_edges }` and executes via `l1/page.ts` + `l1/entities.ts`. Atomic per-call (all-or-nothing).
- **3.6** `packages/cli/src/commands/memory/curate.ts` — `fulcrum memory curate <l0_id> [--dry-run] [--backend codex|pi|openai]`.
- **3.7** Curator telemetry: appends to `vault/curated/log.md` with `{l0_id, backend, affected_pages[], new_entities[], confidence_deltas[], duration_ms, prompt_version}`.
- **3.8** Tests: stub curator backend → verify L1 + graph state mutations; dry-run prints diff without writing; backend rotation test covers codex / openai paths (pi skipped when not installed).

**Verify:** `fulcrum memory curate <some_l0_id> --dry-run` prints the page diffs; without `--dry-run` they land; `cat vault/curated/log.md` shows the audit entry including selected backend; manual toggle `FULCRUM_CURATOR_BACKEND=openai fulcrum memory curate <id>` routes to API path.
**Pre-merge skills:** `compound-engineering:review:adversarial-reviewer` (untrusted input + LLM output; construct failure scenarios), `agent-skills:security-auditor` (subagent — injection + prompt-extraction surface), `compound-engineering:review:correctness-reviewer`, `compound-engineering:ce-review` (persona panel — diff will be ≥50 LOC).

### PR 4 — L2 reshaping: embed L1 pages, keep code_chunks

**Goal:** `vec_memories` embeds L1 page bodies (distilled content). Existing code_chunks embeddings unchanged.

**Units:**

- **4.1** Relocate `storeEmbeddingInVec` + `storeChunkEmbedding` into `packages/memory/src/l2/`.
  - **Skills:** `agent-skills:performance-optimization` (embedding batch queue + p95 budget), `find-docs` on `@xenova/transformers` batch-embed current API, `compound-engineering:review:performance-reviewer` pre-merge.
- **4.2** Curator (PR 3 output) now triggers `recordL1Embedding(page_id)` after each page write/update. Existing fire-and-forget flush semantics carry over (the `flushPendingMemoryWrites` story from the prior work).
- **4.3** Add `fulcrum memory reindex-l2 [--pages|--code]` for operator one-shot re-embedding.
- **4.4** Tests: create L1 page → vec_memories has row; update page → embedding replaced; supersede → old row marked (but kept — supersession is audit, not deletion).

**Verify:** `fulcrum memory reindex-l2 --pages` completes; `sqlite3 "SELECT COUNT(*) FROM vec_memories" == L1 page count`.

### PR 5 — Retrieval cutover: confidence + graph + supersession filters

**Goal:** `recall_memory` / `recall_knowledge` uses the new pipeline. Flag flips to default-on.

**Units:**

- **5.1** Extend `retrieval/search.ts` with graph-traversal stage + confidence filter + supersession filter.
  - **Skills:** `agent-skills:performance-optimization` (graph traversal 100ms budget), `compound-engineering:review:performance-reviewer` pre-merge.
- **5.2** Reciprocal rank fusion weights configurable via env (defaults `fts=1.0, vec=1.0, graph=0.5`).
  - **Skills:** `compound-engineering:ce-optimize` (metric-driven iteration against the eval corpus; do not hand-pick weights).
- **5.3** `recall_knowledge` new action; `recall_memory` aliased for back-compat.
- **5.4** Agent-facing inspection + correction surface:
  - `fulcrum memory sources <page_id>` — walks L1 → L0 references via `sources[]` + inline `[[raw/...]]` wikilinks; prints { l0_id, source_type, snippet, file_path } per source.
  - `fulcrum memory inspect <page_id>` — dumps full L1 page (frontmatter + body + all resolved wikilinks).
  - `fulcrum memory read-raw <l0_id>` — prints the full L0 body (the audit-log entry point).
  - `fulcrum memory trace "<claim>"` — reverse lookup: given a substring, find L1 pages containing it + their L0 provenance.
  - `fulcrum memory mark-wrong <page_id> --reason "<why>"` — appends a `correction` L0 entry under `raw/correction/`, triggers curator re-run with correction hint, new page supersedes the flagged one.
  - MCP parity: `mcp__fulcrum__get_memory_sources`, `mcp__fulcrum__inspect_memory`, `mcp__fulcrum__read_raw_source`, `mcp__fulcrum__trace_claim`, `mcp__fulcrum__mark_memory_wrong`. Every action a user can take via CLI is callable from agents.
- **5.5** Flip default `FULCRUM_MEMORY_V3` to on. Old path callable via `FULCRUM_MEMORY_V3=0` for one release cycle.
  - **Skills:** `agent-skills:shipping-and-launch` / `agent-skills:ship` (pre-flip checklist), `compound-engineering:review:deployment-verification-agent` (Go/No-Go + SQL verify queries + rollback plan).
- **5.6** Integration tests: corpus of 20 L0 dumps → 10 L1 pages → recall a query that requires graph traversal → verify expected page ranks.
  - **Skills:** `agent-skills:test-engineer` (subagent — eval corpus design), `agent-skills:test-driven-development`.

**Verify:** `fulcrum memory recall "auth middleware"` returns L1 pages ordered by fused score; `fulcrum memory recall "auth middleware" --explain` prints per-stage ranks.
**Pre-merge skills:** full `compound-engineering:ce-review` persona panel — adversarial + correctness + performance — this is the cutover PR.

### PR 6 — Data migration: existing vault/memories/ → vault/raw + vault/curated

**Goal:** one-time migration of the 193 k existing files into the new layout. Transactional. Reversible up to the commit.

**Units:**

- **6.1** Classifier: maps each existing memory by `kind` to `L0_raw` (bash_trace, file_patch, tool_trace, session_summary) or `L1_curated_stub` (decision, identity, persona, concept, fact). Dry-run prints the mapping.
  - **Skills:** `agent-skills:deprecation-and-migration` (load-bearing — migration IS the deprecation), `compound-engineering:review:data-migration-expert` (column rename + enum conversion sanity).
- **6.2** Migrator: for L0-class, copy body verbatim to `vault/raw/{kind}/...`; for L1-class, create a stub curated page with `sources: []` (no original L0 exists) and confidence floor 0.5 (human-edited).
  - **Skills:** `compound-engineering:review:data-integrity-guardian` pre-merge, `compound-engineering:ce-debug` for first-run surprises.
- **6.3** Populate `l0_sources` rows from the migrated `vault/raw/` files (one row per file; `source_id` = the ULID in the filename); for each migrated `memories` row classified L1-curated, bump `schema_version` to 3 and backfill `retention_tier` (default `working`), `confidence_decay_at` (`datetime('now')`), `first_seen`, `last_confirmed`, and `provenance.sources` (JSON array of `l0_sources.source_id` values) so the row passes the `l1_pages` view filter. No table-to-table row copy; `memory_id` is preserved so existing recall events and wikilinks don't break.
- **6.4** `runMigration103MemoryV3Cutover(db)` runs last: flips nullable columns (`retention_tier`, `confidence_decay_at`) to NOT NULL via the SQLite table-rebuild dance (see `rebuildMemoriesIfLegacy()` for the pattern), rebuilds indexes. (Note: `canonical_text` drop is deferred to PR 9 unit 9.3 to avoid coupling the cutover to FTS5 trigger rewiring — a known plan-internal split; PR 6 does not touch `canonical_text`.) Writes ledger row `103_memory_v3_cutover`.
- **6.5** Verification pass: `fulcrum memory lint` reports zero orphans, zero missing-source references, zero cycle in supersession graph.
- **6.6** Rollback script `fulcrum memory rollback --to v2` (operator-only, not agent-exposed) restores from pre-migration snapshot.
  - **Skills:** `agent-skills:security-and-hardening` (audit chain integrity), `agent-skills:security-auditor` (subagent — rollback gap hunt), `compound-engineering:review:adversarial-reviewer` (construct "what if migration half-failed" scenarios).

**Verify:** Fresh vault + DB → seed 10 representative rows of each kind via the old path → run `fulcrum memory migrate` → all 10 land in the right tier with complete round-trip.
**Pre-merge skills:** `compound-engineering:review:data-migration-expert` + `compound-engineering:review:data-integrity-guardian` + `compound-engineering:review:deployment-verification-agent` (this touches production data).

### PR 7 — Lifecycle: decay, supersession, consolidation, lint

**Goal:** confidence decay runs as scheduled pass; supersession auto-detected on contradiction; lint pass surfaces health issues.

**Units:**

- **7.1** `l1/lifecycle.ts` — `applyDecay()` (time-based confidence update), `promoteToTier(page_id, target_tier)`, `archivePage(page_id)`.
- **7.2** Contradiction detector: curator output includes `{ contradicts: [old_page_id] }`; auto-applies supersession when confidence of new evidence ≥ old.
- **7.3** `fulcrum memory lint` — orphan pages, broken wikilinks (L1 → L0 link pointing to missing file), cyclic supersession, stale claims (last_confirmed > 90d AND confidence > 0.5), missing source_ids, `sources[]` vs inline wikilink divergence (frontmatter lists an L0 that's not referenced inline, or vice versa), template-validator violations retrospectively applied to existing pages.
  - **Skills:** `agent-skills:api-and-interface-design` (lint output schema is a stable contract consumed by dashboards).
- **7.4** `fulcrum memory consolidate` — finds pages with same entity set + same `retention_tier` AND confidence ≥ threshold; proposes a merged page to curator.
  - **Skills:** `compound-engineering:ce-optimize` (empirical tuning of decay λ + retention-tier thresholds against the eval corpus).
- **7.5** Tests: decay curve matches Ebbinghaus formula within 1%; consolidation dry-run prints proposed merges.

**Verify:** `fulcrum memory lint` returns clean on the freshly-migrated vault; inject a contradiction source → `fulcrum memory curate` → old page marked superseded.

### PR 8 — Auto-triggers (opt-in), observability, docs

**Goal:** curator + consolidator run automatically (opt-in). Metrics surface. Docs updated.

**Units:**

- **8.1** Vault watcher fires L0 → curator (debounced 30s) when `FULCRUM_MEMORY_CURATE_AUTO=1`.
- **8.2** Scheduled consolidation pass via `fulcrum serve monitor` cron when `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE=daily`.
- **8.3** Metrics: L0 ingest rate, L1 page count by tier, curation latency p50/p95, graph node + edge count, confidence distribution histogram. Surfaced at `GET /memory/stats`.
  - **Skills:** `agent-skills:ci-cd-and-automation` (wire `fulcrum memory eval` as a required CI gate).
- **8.4** `docs/architecture/memory-v3.md` — user-facing docs + examples.
  - **Skills:** `agent-skills:documentation-and-adrs`, `elements-of-style:writing-clearly-and-concisely`, `compound-engineering:ce-demo-reel` (capture a GIF: ingest → curate → recall → mark-wrong → re-curate).
- **8.5** Update `CLAUDE.md` + `AGENTS.md` skill docs; update `docs/plans/MASTER-PLAN.md`.
  - **Skills:** `compound-engineering:onboarding` (regenerate ONBOARDING.md's memory section).

**Verify:** Auto-flag on + `fulcrum hook claude post` with a file_patch → curator fires within 60s → L1 page appears; `GET /memory/stats` returns populated counts.

### PR 9 — Cleanup: delete dead code

**Goal:** delete `applyKindCap`, `KIND_CAPS`, `memories.canonical_text`, legacy `writeMemory` shim, `vault/memories/` directory.

**Units:**

- **9.1** Remove `validate-kind.ts` cap logic.
- **9.2** Remove `write.ts` back-compat shim (callers migrated in PR 5).
- **9.3** Remove `canonical_text` column via `runMigration104MemoryV3DropCanonicalText(db)` (SQLite table-rebuild dance; rewires FTS5 triggers to read `content` directly). Writes ledger row `104_memory_v3_drop_canonical_text`.
  - **Skills:** `compound-engineering:review:data-migration-expert` + `compound-engineering:review:schema-drift-detector` pre-merge.
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

## Test Corpus — Phase 5 retrieval cutover gate

PR 5 unit 5.6 blocks on the new pipeline meeting or beating the old on every metric below. Corpus and query set live as test fixtures under `packages/memory/src/tests/retrieval-corpus/` — not generated, deliberately hand-maintained so additions are PR-reviewable.

### Corpus composition (80 L0 sources)

| Bucket | Source type | Count | Origin |
|---|---|---|---|
| Real | `bash_trace` | 15 | extracted from `hook_events` table |
| Real | `file_patch` | 15 | from existing `memories` where kind=file_patch |
| Real | `session_transcript` chunks | 10 | sampled from `~/.claude/projects/*/` |
| Real | `tool_trace` | 5 | from recent agent runs |
| Synthetic | `decision` | 10 | hand-authored, known ground-truth |
| Synthetic | `edit_diff` with cross-source relationships | 10 | designed to exercise graph traversal |
| Synthetic | `prompt_attachment` / `web_capture` | 10 | designed to exercise cross-source synthesis |
| Synthetic | intentional contradictions | 5 | designed to exercise supersession |

### Query set (30 queries)

| Category | Count | What it tests |
|---|---|---|
| Direct FTS (exact-identifier lookup) | 10 | Baseline — both pipelines should be ~equal |
| Semantic paraphrase (camelCase ≈ snake_case ≈ prose) | 8 | Vector + canonical_text correctness |
| Cross-source synthesis (answer requires 2+ sources) | 7 | Graph traversal + RRF fusion |
| Contradiction resolution | 3 | Supersession filter |
| Stale-claim decay | 2 | Confidence + retention_tier |

### Ground truth

Each query has a committed fixture: `{ query, expected_page_ids[] (ordered by ideal rank), min_confidence_of_top_result }`. Maintained in `packages/memory/src/tests/retrieval-corpus/ground-truth.yaml`.

### Success metrics (new pipeline must meet or beat old on ALL)

| Metric | Baseline | Target |
|---|---|---|
| Recall@10 across all 30 queries | measured on PR 0 branch | **≥ baseline + 10 pp** |
| Precision@10 | measured | **≥ baseline** (don't regress) |
| NDCG@10 (rank-weighted) | measured | **≥ baseline + 15 pp** (graph helps here) |
| p95 latency | measured | **≤ 1.5× baseline** (graph stage has a 100ms budget) |
| Supersession-awareness (contradiction queries return only new page) | N/A (old has no supersession) | **100%** |

### Eval harness

`fulcrum memory eval --corpus retrieval-corpus [--pipeline v2|v3|diff]` — runs both pipelines against the corpus, prints per-metric table with pass/fail per target. Wired into CI (PR 8 unit 8.1). PR 5 cutover is blocked until this command exits 0 on main.

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
| FTS5 trigger rewrite on `canonical_text` drop | PR 9 unit 9.3 rebuilds FTS5 triggers to read `content` directly after dropping `canonical_text`; tested on a copy of prod DB. **PR 6 does NOT touch FTS5 or `canonical_text` — those are decoupled from the cutover to keep the migration surface small.** |
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
- [x] ~~Open Question #1 (curator model)~~ — codex-subprocess-primary via user's Pro plan; `gpt-5-mini` with `reasoning_effort=minimal` default, per-task overrides
- [x] ~~Migration downtime window~~ — no cutoff; notify user when Phase 6 starts; they hold new work voluntarily
- [x] ~~Test corpus + success criteria for Phase 5 retrieval cutover~~ — 80 L0 sources / 30 queries / 5 metrics, see `§Test Corpus` above
- [x] ~~Guided templates + L0 traceability~~ — codified as hard constraints #9 + #10
- [x] ~~Skill utilization~~ — mapped explicitly per PR in `§Skill Utilization Matrix`

All boxes checked — PR 0 is unblocked. Remaining dependency: user give-the-word.
