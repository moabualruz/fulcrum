---
date: 2026-04-16
topic: memory-architecture-v2
part: "00"
title: Scope Split — v2a Baseline vs v2b Knowledge Graph
index: index.md
next: 01-problem-and-philosophy.md
review: docs/brainstorms/2026-04-16-memory-architecture-v2/review-v11-findings.md
---

# Memory Architecture v2 — 00 — Scope Split (v2a Baseline / v2b Knowledge Graph)

**[← Index](index.md)** · **[Next: Problem & Philosophy →](01-problem-and-philosophy.md)**

## Why a split

Document review (v11, 6 reviewers in parallel) converged on one finding: the spec as written answers a different question than the one it was formed to answer.

**Stated problem** (from Part 01):
> "Fulcrum's memory system currently depends on agents manually calling `recall_memory` / `write_memory` tools. Hooks partially exist but write only parameter keys, with no dedup, typing, provenance, safety fence, or non-primary guards. Context compaction drops decisions silently. No durability policy."
>
> "Code-index primitives exist but are not wired into a running system."

**What the spec grew into** (11 revisions, 70 acceptance criteria, 37 planning questions, 5 reference projects mined): full control-plane unification across 51 tables into a single Kuzu knowledge graph, per-host plugin standardization for 6 hosts including a net-new Copilot integration, Dreaming promotion pipeline, LongMemEval benchmark harness, global-scope pointer collection, A2A card graph derivation, monitor Graph dashboard tab, procedural-memory proposal pipeline.

Reviewers found that three items — scope drift, identity conflict (AGENTS.md declares control-plane-first; spec title is memory-first), and architectural falsifications (the "Kuzu 51-table scaffolding" claim — actual Kuzu has 2 node tables + 18 rel tables) — demand a resequence before `ce:plan`.

**Decision (2026-04-16 v12):** ship two deliverables.

- **v2a — Baseline.** Directly closes the stated problem. 1–3 weeks. 8 PRs. Memory hooks, PCI watcher, sanitize + WAL, context guards, short-term / durable tiers, task-lifecycle synthesis, cross-host correctness fixes.
- **v2b — Knowledge Graph.** Separate roadmap. 4–8 weeks. Unified Kuzu graph across 51 tables, cross-entity `project_context`, git-object ingestion, external-sync graph refs, A2A card derivation, monitor Graph tab, global pointer, procedural-memory proposals, LongMemEval harness, Copilot integration, plugin-bundle distribution.

v2a is independently shippable. v2b is a coherent next bet; only invested after v2a has produced evidence of what agents / operators actually need.

---

## v2a — Baseline (IN SCOPE)

### What v2a ships

Every item below directly answers the stated problem.

**Memory write correctness + durability** (hooks + sanitization):
- Typed `PostToolUse` writes with real `file_path` / `content` / `command` extraction (§1 write paths — Part 03)
- Per-turn dedup via `sha256(tool_name, normalized_args, cwd)` (§1.0)
- `kind` enum + char caps per kind (§3.4 — Part 04)
- Provenance sidecar on every write (§3.2)
- Stop-hook `session_summary` fallback (§1 write paths)
- `update_task(status=completed|blocked)` → `task_outcome` / `blocker_resolution` synthesis (§1)
- prior art `on_delegation` for parent-side subagent memory (§1)
- PreCompact extractor → `pre_compact_extract` memories (§1)
- Sanitize-on-write middleware: fence marker strip + prompt-injection detection + credential redaction + invisible-Unicode strip (§6 — Part 05)
- WAL with sha256-only redaction; **sanitize runs before WAL** (§5.6)
- Untrusted-context fence on `recall_memory` output (§2.2 — Part 03)
- `min_score` safety floor (§2.6)

**Memory tiers + supersession scaffolding (Dreaming itself is v2b):**
- Short-term / durable tier with `tier` column (§4 — Part 04)
- `slug` + `vault_path` + `supersedes` + `embedded` + `schema_version` + `normalize_version` columns (§3.2)
- Karpathy LLM Wiki shape for short-term (frontmatter + `[[wikilinks]]` + tags, §1.0)
- `memory_wikilinks` + `memory_tags` tables (§3.3a / §3.3b)
- `memory_recall_events` signal ledger (§3.3)
- v2a ships **scaffolding only**: schema columns + recall-events ledger that Dreaming will consume.
- **Dreaming light / REM / deep phases are deferred to v2b PR 11** (per source inventory line 205; resolves cross-plan review P0-1 and the prior scope-split / manifest contradiction). Reasoning: Dreaming promotion thresholds are themselves gated by v2b Gate 3 (249-session offline sweep) — shipping Dreaming in v2a means firing it without the evidence the gate exists to provide.
- Promotion re-reads live source (prior art pattern) — implemented in v2b
- Promotion thresholds from manifest B.4 — applied in v2b after Gate 3 sweep validates them
- Re-sanitize at promotion boundary before appending to native host MEMORY.md files — implemented in v2b (security review finding #5 still binds when Dreaming lands)

**PCI (memory + code only, not full knowledge graph):**
- `code_files` / `code_chunks` / `code_symbols` / `code_chunks_fts` tables (§3.3c — Part 04)
- `projects` portable-pathing table (§3.3d)
- Project-root-relative paths; `file_id = sha256(project_id + ':' + rel_path)` (§1.2)
- Incremental ingest (mtime → hash → chunk diff)
- Prose / code / config chunkers (§1.1 PCI — Part 02)
- PCI watcher: singleton, reference-counted, cross-process lock, 30s grace period (§5.5 — Part 05)
- Kuzu graph for memory nodes and code nodes ONLY — with cross-type `edits` / `about` / `mentions` edges. Matches existing `kuzu/schema.ts` shape (Memory + Entity) extended with File + CodeChunk + Symbol. NOT the full 51-table unification.

**Context-type guards (safety primitive):**
- `context_type` column on `agent_runs` with **NO DEFAULT** (required parameter, per security review finding #6) — Part 04 §3.1 + Part 05 §5
- Non-primary runs silently drop writes (except `delegation_summary`)
- Context-type guard runs even when flag is off (defense in depth)

**Retrieval (memory + code, not cross-entity):**
- `recall_memory` MCP action — durable tier via FTS + vec + Kuzu traversal fused by RRF
- `query_memory` MCP action — short-term wiki (FTS + wikilinks + tags, no embedding)
- `search_code` MCP action — code chunks (FTS + vec + symbol hybrid)
- **Excluded from v2a:** `code_context` (graph-traversal cross-type), `project_context` (cross-entity bundle) — require full knowledge graph.

**Scoping (session / project / workspace only — no global):**
- `scope: 'session' | 'project' | 'workspace'` on all three recall actions
- **Excluded from v2a:** `scope: 'global'` — requires cross-workspace role policy (§12.12) + global pointer collection (§8.3), both v2b.

**Per-host correctness fixes (required for v2a):**
- Hook matcher narrowing on Claude / Gemini / Codex / OpenCode (Part 08 §S2) — prevent spurious Read/Glob/Grep writes
- Run-lifecycle signal wiring on Claude (`SessionEnd` + `SubagentStart/Stop`), Gemini (`AfterAgent`), Codex (`notify`), OpenCode (`session.idle` + `session.compacted`) (Part 08 §S3)
- Gemini `BeforeAgent` stub removal (per review note: was never wired; config entry deleted as cleanup)
- Codex `PLACEHOLDER_PLUGIN_PATH` fix (Part 08 §H3)
- Pi cockpit `start` / `stop` / `status` CLI + dead-JSON deletion (Part 08 §H6)
- OpenCode in-plugin tool allowlist (Part 08 §H4)

**CLI-first invocation + selective MCP overlay** (§1.4 — Part 02).

### v2a acceptance-criteria subset (from Part 07)

All §11.1–20 except §11.11 (the `query_memory` backlink-traversal criterion stays; global-pointer criteria cut).

Specifically: §11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13, 11.17, 11.18, 11.19, 11.20 (prose ingestion covers md + configs), 11.21, 11.22, 11.23, 11.24 (central store invariant), 11.25 (portable pathing), 11.26 (project move), 11.27 (scope: project), 11.28 (scope: workspace), 11.30 (min_score floor), 11.33 (normalize_version silent rebuild), 11.34 (WAL redaction), 11.36 (cold install works), 11.37 (no auto-activation), 11.38 (action surface stable), 11.39 (Pi command-only), 11.40 (`project_context` shape-stable — degraded to `recall_memory` / `query_memory` / `search_code` in v2a), 11.41 (workflows loadable — kept as existence check), 11.44 (CLI-first coverage), 11.45 (MCP opt-in), 11.46 (CLI/MCP parity).

**Deferred to v2b alongside Dreaming:** §11.5 (Dreaming deep-phase promotion), §11.14 (post-Dreaming `embedded=1` invariant), §11.15 (Dreaming light dangling-link report), §11.16 (Dreaming deep supersession edges), §11.42 (policy rules registry CLI — natural home is v2b PR 12 alongside role-policy work; v2a has no consumer), §11.43 (`list_activations` MCP tool — control-plane workflow features are dormant in v2a; surface lights up in v2b).

Plus **v2a-specific host-correctness criteria** from Part 08: §11.62 (Codex marketplace), §11.64 (OpenCode event subs), §11.67 (shared skills deployed for the 5 existing hosts; Copilot symlinks are v2b), §11.68 (hook matcher narrowness), §11.70 (dead artifacts removed). §11.69 (Pi npm publish) is **v2b** (resolves the prior internal contradiction with line 167; `fulcrum-cockpit` to npm is in the v2a-NOT-included list).

**Deferred to v2b:** §11.5 (Dreaming deep-phase promotion), §11.14 (post-Dreaming `embedded=1`), §11.15 (Dreaming light dangling-link report), §11.16 (Dreaming deep supersession edges), §11.29 (global scope), §11.31 (global pointer pre-filter), §11.32 (WAL replay — stay as future capability; ensure WAL structure supports it), §11.35 (LongMemEval floor), §11.42 (policy rules registry CLI), §11.43 (`list_activations` MCP tool), §11.47 (external sync graph refs), §11.48 (git PR chain), §11.49 (adapter telemetry graph), §11.50 (prose covers docs — kept but retarget), §11.51 (monitor graph endpoints), §11.52 (CoS as graph query), §11.53 (A2A card graph), §11.54 (policy events graph), §11.55 (team membership graph edges), §11.56 (artifact conformance graph), §11.57 (analytics reachable), §11.58 (event-bus graph taxonomy enforced), §11.59 (orthogonal tables absent from reducers), §11.60 (Claude plugin bundle — distribution), §11.61 (Gemini BeforeModel/AfterModel/PreCompress — enhancement), §11.63 (Codex invoke_team prompt approval — enhancement), §11.65 (Copilot Chat MCP), §11.66 (Copilot Agent Mode), §11.69 (Pi npm publish — `fulcrum-cockpit` published to npm).

### v2a PR sequence

Subset of the source inventory. ~3 weeks, 8 PRs:

1. **PR 1 — Schema + Tier A algorithms.** Schema extensions; drop `memories.kind` CHECK constraint (apply feasibility finding F1 mitigation — widen enum via TEXT only, validation moves to `fulcrum-memory/write.ts`). Add `slug` / `vault_path` / `supersedes` / `embedded` / `schema_version` / `normalize_version` via table rebuild (NOT additive) — feasibility F2 acknowledged. Merge Tier A copy-verbatim files (temporal-decay, MMR, hybrid, events, memory-schema, walker, lock, intent, colbert-math, ignore-patterns, hash, git-files). Memory + Code Kuzu node DDLs only — NOT all 51 tables.
2. **PR 2 — Retrieval pipeline.** prior-art `searcher.ts` port — RRF + rerank + diversification. Same I/O as current `recall.ts`, new internals.
3. **PR 3 — AST chunker extension.** Merge prior-art chunker fields. Prose chunker added (markdown + config).
4. **PR 4 — PCI watcher + syncer.** Decide chokidar vs. prior-art per-dir `fs.watch` topology (feasibility F5, adversarial F10) — pick ONE. Implement singleton + refcount + cross-process lock + incremental ingest + dedup against existing vault watcher (feasibility F12).
5. **PR 5 — Sanitize + WAL + query sanitizer.** prior art threat scanner port + prior art WAL with **sanitize-runs-BEFORE-WAL invariant** (safe-fix #5) + prior art query sanitizer + `fulcrum memory rollback` **operator-only, not agent-exec-reachable** (safe-fix #7).
6. **PR 6 — Hook writes rewrite.** Rewrite `packages/cli/src/hooks.ts` `runPostHook`. Delete Gemini `BeforeAgent` stub entry (was never wired — safe-fix #2 clarifies no semantic change). Narrow matchers per Part 08 §S2.
7. **PR 7 (scoped) — Kuzu graph, memory + code nodes only.** NOT the full 51-table unification. DDL: Memory + Entity + File + CodeChunk + Symbol nodes; `edits` / `about` / `mentions` / `imports` / `calls` / `defines` / `contained_in` rel tables. Stays within the existing Kuzu shape's generalization.
8. **PR 8 — task_outcome synthesis + delegation hook.** Port prior art on_delegation. Ship `task-tracking` skill as always-present guidance.

Additional per-host correctness PRs (parallelizable with PRs 4–8, total ~1 day):
- Fix Codex `PLACEHOLDER_PLUGIN_PATH` (§H3)
- Fix OpenCode allowlist (§H4)
- Wire Gemini `AfterAgent` + Codex `notify` (§H2 + §H3)
- Add Claude `SessionEnd` + `SubagentStart/Stop` (§H1 partial — skip the `.claude-plugin/plugin.json` bundle)
- Delete Pi dead `fulcrum.extension.json` (§H6)
- Ship `fulcrum pi cockpit start/stop/status` command (§H6)
- Symlink `agent-integration/skills/` canonical tree into 5 host directories (§S1)

Timeline: 3 weeks for one engineer, 1.5 weeks for two engineers with PR parallelism. **Target: cold-install zero-activation productive with typed memory + code index after PR 4 merges.**

### Safe fixes merged into v2a

Applied across the doc:

1. **prior art threshold reconcile** → use manifest B.4 verbatim (`minRecallCount 3 / minUniqueQueries 2 / minScore 0.75`). Part 06 §8 updated to match. Rationale: adoption fidelity with the verbatim-copied source.
2. **BeforeAgent wording** → "stub was never wired; config entry removed as cleanup — no semantic change."
3. **Effort reconcile** → 9h 45m (line-item table), supersedes the ~9–10h hand-wave.
4. **Section numbering** → added reference-table in `index.md` mapping §X.Y to chunk+heading.
5. **WAL ordering invariant** → added to Part 05 §5.6.
6. **Monitor loopback invariant** → added to Part 02 §1.5 monitor entry.
7. **`fulcrum memory rollback` auth boundary** → added to Part 05 §5.6.

### v2a does NOT include

- Full 51-table Kuzu knowledge graph unification
- `project_context` cross-entity bundle action
- `code_context` cross-type graph traversal
- Git object ingestion (`git_commit` / `git_branch` / `git_pr` / `git_tag` nodes)
- External sync graph refs (`external_ref` nodes)
- Agent-adapter graph nodes
- A2A card graph derivation
- Monitor `/graph/query` + Dashboard Graph tab
- Global-scope cross-workspace recall + `scope: 'global'` + global pointer collection
- Procedural-memory proposal pipeline
- LongMemEval benchmark harness + CI integration
- Copilot integration (all three paths — MCP + skills + `copilot-instructions.md`)
- Claude Code plugin bundle for marketplace distribution
- Gemini `BeforeModel` / `AfterModel` / `PreCompress` hooks (enhancement, not correctness)
- Codex `invoke_team` native approval-mode (policy-hook denial still works in v2a)
- Policy events in the unified graph (policy events still recorded in SQLite; just not graph-reduced)
- Analytics rollups reachable via `get_analytics` action
- `fulcrum-cockpit` published to npm (cockpit still usable via monorepo clone)

Everything on this list is v2b.

---

## v2b — Knowledge Graph (DEFERRED)

Separate roadmap. Lands after v2a has produced evidence of what actually matters.

### Scope

Full realization of §1.3 (control-plane unification) and §1.5 (complete inventory). Includes all v2a-excluded items above plus:

- Full Kuzu graph across 51 tables: `task` / `agent_run` / `team_instance` / `team_template` / `team_members` / `workflow_run` / `handoff` / `artifact` / `review` / `worktree` / `epic` / `issue` / `prd` / `plan` / `git_commit` / `git_branch` / `git_pr` / `git_tag` / `external_ref` / `agent_adapter` / `artifact_contract` / `notification_event` / `policy_event` node types with cross-type edges per Part 06 §8.1.
- `project_context` MCP action — cross-entity bundle around a root.
- `code_context` MCP action — graph-traversal + cross-type memory edges.
- Monitor `/graph/query?cypher=` + `/project-context` + `/a2a/cards/<role>` endpoints + Dashboard Graph tab.
- Global-scope cross-workspace recall with §12.12 role policy resolved.
- Global pointer collection at `{globalDataDir()}/memory/dreaming/global_index.md`.
- A2A card `agent_card` derivation from `agent_definitions`.
- Dreaming REM entity + relationship extraction into Kuzu.
- Dreaming procedural-memory proposal pipeline.
- LongMemEval harness + CI regression job (the benchmark is reframed against Fulcrum-specific eval; see Part 07 §11.35 and product review finding #7).
- Copilot integration (MCP + skills + `copilot-instructions.md` — three paths).
- Claude Code `.claude-plugin/plugin.json` bundle for marketplace distribution.
- Gemini `BeforeModel` / `AfterModel` / `PreCompress` hooks.
- Codex `invoke_team` native approval-mode.
- Analytics rollup access via `get_analytics` action.
- `fulcrum-cockpit` published to npm.

### v2b prerequisites

- v2a must ship and bake at least 2 weeks.
- Real usage data on short-term promotion rates (inform Dreaming threshold tuning per adversarial finding F3 and review recommendation to run the §12.2 offline sweep on 249 imported sessions before scaling Dreaming).
- Real usage data on memory quality (replace LongMemEval floor with a Fulcrum-specific eval — product review finding #7).
- Identity decision: title + AGENTS.md coherence (product review finding #2) — either update AGENTS.md to reflect memory-first framing, OR re-sequence v2b PRs to keep control-plane-first identity.
- User request for Copilot (product review finding #4) — defer until someone asks.

### v2b open questions that v2a doesn't need to answer

From Part 07 §12: questions §12.12 (global-scope role policy), §12.26 (git ingestion), §12.27 (external-sync cadence), §12.28 (adapter identity), §12.29 (graph query language — Cypher vs JSON DSL), §12.30 (prose chunker placement — some lands in v2a), §12.31 (per-host plugin standardization), §12.32–37 (all host-specific enhancements).

---

## Applying the review findings

This split addresses these review findings directly:

- **Adversarial F1** (Kuzu scaffolding myth): v2a only adds Memory + Code node DDLs, which match the current Kuzu shape's generalization. v2b takes on the ~20-table DDL expansion as an explicit ~2-week PR, not hidden in a "4-day" PR 7.
- **Adversarial F2** (prior art threshold contradiction): resolved via safe-fix #1.
- **Feasibility F1 + F2** (CHECK widening, UNIQUE on populated DB): PR 1 acknowledges the table rebuild explicitly; `FULCRUM_MEMORY_V2=0` rollback is best-effort (not claimed as clean).
- **Feasibility F4** (unified graph across 51 tables): deferred to v2b.
- **Product F1** (scope drift 20x problem): v2a directly answers the stated problem.
- **Product F2** (identity conflict): forced as a v2b prerequisite.
- **Product F4** (Copilot researcher enthusiasm): deferred to v2b pending user request.
- **Product F6** (Dreaming thresholds may yield zero promotions): v2a uses manifest B.4 values but v2b prerequisite is the §12.2 sweep on 249 sessions.
- **Product F7** (LongMemEval warped): deferred to v2b with reframe mandate.
- **Scope F2** (control-plane unification is scope addition): deferred to v2b.
- **Scope F5** (Part 08 is parallel track): split — correctness fixes in v2a, enhancements + distribution in v2b.
- **Scope F6** (no P0/P1 tiers): v2a/v2b split implements the tiering.
- **Security findings**: all incorporated as safe-fixes or explicit v2a scope items (sanitize-before-WAL, monitor loopback, rollback auth, context_type no-default, re-sanitize at promotion boundary).

---

**[← Index](index.md)** · **[Next: Problem & Philosophy →](01-problem-and-philosophy.md)**
