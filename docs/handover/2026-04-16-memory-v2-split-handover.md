---
date: 2026-04-16
kind: handover
session_duration: single long ideation + brainstorm + review session
next_session: ce:plan on v2a AND v2b (two plans), then cross-plan handoff review
do_not_commit: research + requirements + ideas + plans are working docs only
---

# Handover — Fulcrum Memory Architecture v2 Split

## Session summary

Single long session that went from an ideation prompt ("memory automation via hooks") through 12 requirements revisions, 5 local-source research deep-dives, a 6-persona document review, and a v2a/v2b scope split. The session was driven by repeated user reframes that each expanded or corrected the spec; eventually, document review surfaced scope drift + architectural falsifications + identity conflict, triggering the v2a/v2b split.

**End state:** v2a is ready for `ce:plan`. v2b is deferred but specified. Cross-plan handoff between v2a → v2b is the next review gate.

**Nothing has been committed.** All docs are working files. Preserve that until the user explicitly approves a commit.

---

## What's on disk (all uncommitted)

### Requirements (split v12)

Path: `docs/brainstorms/2026-04-16-memory-architecture-v2/`

- `index.md` — hub with v2a/v2b table + section-numbering reference table.
- `00-scope-split.md` — **read first.** Authoritative v2a/v2b boundary, v2a PR sequence, v2a acceptance-criteria subset, deferred-to-v2b list, review-finding mitigations.
- `01-problem-and-philosophy.md` — foundational (both v2a + v2b).
- `02-activation-and-inventory.md` — §1.3 control-plane unification (mostly v2b), §1.4 activation model (v2a), §1.5 complete inventory (mixed), monitor loopback invariant (safe-fix #6).
- `03-write-and-recall-paths.md` — v2a recall tools: `recall_memory`, `query_memory`, `search_code`. v2b: `code_context`, `project_context`.
- `04-data-model.md` — v2a schema. `context_type` NO DEFAULT applied (security fix).
- `05-safety-watcher-wal.md` — all v2a. WAL sanitize-before-WAL invariant (safe-fix #5) + rollback operator-only (safe-fix #7) + DR-is-best-effort clarification (adversarial-F5).
- `06-hooks-dreaming-operations.md` — hooks + basic Dreaming = v2a. §8.1 Kuzu full 51-table + §8.2 procedural proposals + §8.3 global pointer = v2b. Dreaming thresholds reconciled to manifest B.4 (safe-fix #1). Re-sanitize at promotion boundary (security-F5).
- `07-acceptance-and-planning.md` — 70 acceptance criteria + 37 planning questions + session log v1–v12. Cross-cutting.
- `08-per-host-plugin-integration.md` — per-row `[v2a] / [v2b]` tags. v2a correctness fixes ≈ 4h 22m; v2b enhancements + Copilot ≈ 5h 23m. Total 9h 45m canonical (safe-fix #3).

### Companion

Path: `docs/brainstorms/2026-04-16-memory-v2-source-inventory.md`

Copy-file / integration plan split into 9 v2a PRs (PRs 1–9, ~3 weeks) and 12 v2b PRs (PRs 10–21). Effort estimates revised per feasibility review (PR 1: 1 week, PR 3: 1 week, PR 4: 1.5–2 weeks, PR 7: 1 week, PR 10: 2 weeks — were understated before).

### Research (grounding)

Path: `docs/research/`

- `memory-patterns-prior-art-hermis.md` — web research on prior art + prior art memory patterns.
- `memory-patterns-prior-art.md` — prior art patterns (WAL, silent rebuild, BM25+vec, LongMemEval).
- `memory-prior-art-local.md` — local deep-dive: 5 copy-verbatim + 5 adapt patterns + 3 don't-fit from prior art TS source.
- `memory-prior-art-prior-art-local.md` — local deep-dive: 5 concepts each from prior art (Python) + prior art (Python).
- `code-search-prior-art-prior-art.md` — local deep-dive: prior-art retrieval pipeline = crown jewel; prior-art per-dir `fs.watch` = only piece prior-art lacks; both write project-local (violate global-only rule).
- `plugin-standards-per-agent-host.md` — Claude / Gemini / Codex / OpenCode / Copilot / Pi standards + gap analysis.

### Precursors

- `docs/ideation/2026-04-16-memory-automation-hooks-ideation.md` — 46 raw candidates → 7 survivors.
- `docs/handover/memory-automation-via-hooks.md` — original v1 handover that seeded this session.

---

## Key decisions made (story of v1→v12)

- **v1–v2** (initial): memory hooks + Karpathy LLM Wiki shape for short-term vault.
- **v3** (user reframe): add code indexing as sibling system → Project Content Index (PCI) substrate.
- **v4** (user reframe): central SQLite + portable project-root-relative paths; `file_id = sha256(project_id + ':' + rel_path)`; scope hierarchy session / project / workspace / global.
- **v5**: prior art research → WAL, min_score, global pointer, `schema_version` / `normalize_version`, LongMemEval harness.
- **v6** (user reframe): unify ALL 51 tables into one Kuzu knowledge graph; new `project_context` MCP tool; 5-reference-project mining (source inventory).
- **v7** (user reframe): control-plane features (tasks/teams/workflows/cockpit) are OPT-IN; everything shipped + ready + dormant; user/agent must seek to activate.
- **v8** (user reframe): workflows are *always installed* not activated — agents invoke explicitly, nothing auto-runs.
- **v9** (user reframe): CLI-first methodology (`fulcrum action exec`) is primary; MCP is selective on-demand overlay; only installed when target agent can't use CLI-first.
- **v10**: full inventory of all 51 tables + per-package roles. §1.5 complete inventory added. Graph node taxonomy documented (6 groups × 9 edge categories).
- **v11**: plugin-standards research → Part 08 per-host plugin requirements. Copilot added as net-new host. ~9h 45m per-host effort.
- **v12** (document review + split): 6-persona review surfaced HIGH-severity architectural falsifications + scope drift + identity conflict. **v2a/v2b split** via new `00-scope-split.md`. 7 safe fixes applied + 2 bonus security fixes. Effort estimates revised up per feasibility.

---

## Critical constraints (must preserve in planning)

1. **Global-only data** (HARD). All DB / vault / sessions under `globalDataDir()` from `fulcrum-core`. Never project-local. `.fulcrum/` in project dir is forbidden.
2. **L0 → L1 → L2 write order.** L0 (vault markdown) first; L1 (SQLite) second; L2 (Kuzu + sqlite-vec) third/async. `upsertStateEntry()` before `writeFileSync()` to avoid watcher echo.
3. **Full 64-char sha256.** Never truncate — breaks echo-suppression.
4. **Control-plane features are dormant, not absent.** All code ships; nothing auto-runs beyond baseline (memory writes, PCI watcher, sanitization, context guards, secret scan, recall tools).
5. **CLI-first primary; MCP overlay.** Every capability reachable via `fulcrum action exec <name>`. MCP is selective subset exposed via `fulcrum serve mcp --mode filtered`, added on demand.
6. **Write-side automation; recall stays agent-explicit.** No auto-injection anywhere. Agents call `recall_memory` deliberately.
7. **Context-type NO DEFAULT.** `start_agent_run` requires explicit `context_type` argument; fail-closed.
8. **Sanitize runs BEFORE WAL.** WAL records post-sanitize body hash only.
9. **Monitor binds loopback.** 127.0.0.1 asserted at startup; refuses non-loopback without auth token.
10. **Rollback is operator-only.** `fulcrum memory rollback` NOT exposed via agent-callable `fulcrum action exec`.

---

## Outstanding architectural decisions (planning must resolve)

These are from §12 planning questions + review findings. Ordered by blocking impact for v2a:

1. **PCI watcher topology decision (chokidar vs prior-art per-dir `fs.watch`).** §5.5 currently says chokidar; manifest Tier A #11 mandates prior-art; both cannot coexist. Feasibility F5, adversarial F10. **Blocks PR 4.** Decision needed before planning starts.
2. **`memories.kind` CHECK-widening strategy.** Current schema has closed CHECK enum; v2a needs 8+ new kinds. Option A: drop CHECK, validate in app. Option B: table rebuild. Feasibility F1. **Blocks PR 1.**
3. **`slug NOT NULL UNIQUE` migration.** `ALTER TABLE` can't add these in-place on populated DBs. Must rebuild. Feasibility F2. Acknowledge in PR 1 plan.
4. **RRF vs prior art weighted-sum fusion.** §12.15. Pick one. Benchmark against current corpus. Default: RRF (Tier A `hybrid.ts`) with prior art variant in reserve. Open for planning to validate with a micro-bench.
5. **`min_score` return shape.** Adversarial F4: MCP protocol needs to distinguish "no match" from "below floor" so agents can adjust queries. Plan must specify envelope (`{results, reason?}` vs current array-only return).
6. **Kuzu DDL set for v2a.** PR 7 is scoped to memory + code nodes (File, CodeChunk, Symbol + edges). Planning must author actual Kuzu DDL. Existing file: `packages/memory/src/kuzu/schema.ts` (2 node tables today).
7. **Gitignore respect in PCI watcher.** §12.9 — use `ignore` npm package vs shell-out to `git ls-files`. Planning picks.
8. **Session-scope storage.** §12.13 — in-memory rolling vs persisted. Planning picks.

For v2b, additional decisions (can defer):
- §12.12 Global-scope role policy (chief_of_staff + ??).
- §12.6 Open kind enum shape.
- §12.26 Git ingestion strategy.
- §12.29 Graph query language (Cypher vs JSON DSL on monitor endpoint).

---

## Review findings still open (watch during planning)

**HIGH severity — planning must address or explicitly accept:**

- **Kuzu scaffolding myth (adversarial F1):** `packages/memory/src/kuzu/schema.ts` has 2 node tables; v2b PR 10 authors ~20 new Kuzu node DDLs + ~25 new rel DDLs. Not 4 days. Realistic: 2 weeks. **Planning must verify actual Kuzu client capability before scheduling PR 10.**
- **Dreaming promotion rate risk (adversarial F3):** prior art thresholds tuned for chat workload; Fulcrum is code-agent. Likely promotion rate is ~0% without rework. **v2b PR 11 prerequisite: offline sweep on 249 imported sessions.** If <5% promotion rate, rework thresholds before the deep-phase code lands.
- **LongMemEval is warped (product F7):** conversational-memory benchmark; Fulcrum is code-change memory. **v2b PR 14 must design a Fulcrum-specific eval, not just port LongMemEval.**
- **Identity conflict (product F2):** AGENTS.md says "control-plane-first"; spec title says memory-first; PR distribution is memory-heavy. **v2b prerequisite decision:** either update AGENTS.md OR re-sequence v2b PRs to foreground control-plane. Planning should surface this as a gate.
- **Copilot at zero user request (product F4):** v2b PR 18 defers until a user asks.

**MODERATE — planning should note:**

- CLI/MCP parity at parameter level (adversarial F8). Windows fork() cost 50ms per hook. Planning should add an AC measuring hook-shell latency on Windows.
- Graph reducer fail-silent silently corrupts Kuzu (adversarial F14). Planning should add reducer-lag / Kuzu-SQLite-divergence monitoring.
- Portable pathing breaks on renames (adversarial F7). Planning should add a `project_rename` command for monorepo restructures.
- `global_index.md` file-level ACL (security F7). Planning picks: restrict file permissions vs. strip workspace IDs.
- Reducer subscription cost (adversarial F11). Planning should bound event-bus throughput.

---

## Strict rules for the pickup session

1. **DO NOT commit** any of: requirements chunks, source inventory, research docs, ideation, handover, or the forthcoming v2a/v2b plans. All stay uncommitted working docs until explicit user approval.
2. **DO NOT re-open scope.** v2a and v2b boundaries are set in `00-scope-split.md`. Planning works within the boundary. If new scope appears, surface it to user, don't absorb it.
3. **DO NOT skip `00-scope-split.md`.** It's the authoritative scope doc; every PR maps to v2a or v2b.
4. **DO NOT defend decisions the user already reframed.** The session log in chunk 07 documents 12 revisions driven by user reframes. Planning honors the v12 conclusions, not earlier versions.
5. **DO NOT try to plan everything at once.** Two plans: one for v2a, one for v2b. Each can be dispatched in parallel, but they are distinct deliverables.
6. **DO apply the safe fixes already in the docs.** They're in the chunks — planning consumes them, doesn't re-derive them.
7. **DO cite file paths + line numbers** in the plan. Every task should reference a specific file + specific change, not abstract work.

---

## Next session's mission

1. **`ce:plan` on v2a.** Input: `00-scope-split.md` (v2a PR sequence) + source inventory PRs 1–9 + Part 08 v2a-tagged rows + chunks 03–06 (v2a scope items). Output: detailed implementation plan with tasks, acceptance gates, file-level changes per PR.
2. **`ce:plan` on v2b** (can run in parallel). Input: `00-scope-split.md` (v2b deferred-list) + source inventory PRs 10–21 + Part 08 v2b-tagged rows + chunks 02 (§1.3, §1.5 v2b portions), 06 (§8.1, §8.2, §8.3). Output: roadmap plan with prerequisites, decision gates, and explicit "this requires v2a evidence first" markers.
3. **Cross-plan handoff review.** After both plans exist, verify:
   - Every v2a output (schema, graph nodes, MCP actions, skills) is consumable by v2b without rework.
   - v2b prerequisites (identity decision, 249-session sweep, Fulcrum-specific eval, user request for Copilot) are explicit gates.
   - No v2b PR assumes work that's in v2a's deferred list.
   - v2a's feature flag (`FULCRUM_MEMORY_V2=1`) stays on through v2b; v2b PR 21 removes it.
   - Kuzu schema additions in v2a PR 7 are forward-compatible with v2b PR 10's expansion (no table rebuilds).
   - PCI watcher topology choice in v2a PR 4 works for v2b's additional indexing (external sync writes, git ingestion).
4. **Present both plans** for user review. User decides whether to commit + execute v2a first, or continue refining.

---

## Pickup prompt (paste into new session)

The pickup prompt lives at `/home/mkh/workspace/pi-stack-plan/docs/handover/2026-04-16-memory-v2-pickup-prompt.md` — paste its content into a new Claude Code session to resume.
