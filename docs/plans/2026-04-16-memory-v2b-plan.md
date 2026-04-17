# Roadmap: Memory v2b — Knowledge Graph + Control-Plane Unification

## Overview

v2b is the deferred Knowledge-Graph + control-plane-unification roadmap that lands AFTER v2a (`docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` §"v2a — Baseline (IN SCOPE)") has shipped and baked. It executes source inventory PRs 10–21 (`docs/brainstorms/2026-04-16-memory-v2-source-inventory.md`), expands the Kuzu graph from v2a's Memory + File + CodeChunk + Symbol nodes to the full 51-table unification per Part 06 §8.1, lights up `code_context` / `project_context` / global-scope recall / monitor `/graph` endpoints, and finishes per-host plugin distribution. v2b is gated behind five prerequisites that must clear before any PR begins; one of them (identity decision) blocks PR 10 specifically and requires user input. Total realistic effort: ~6–8 weeks across 12 PRs after a ≥2-week v2a bake window.

## Prerequisites (GATES, not tasks)

These are entry gates. None of them is a v2b PR task; each must be cleared as a precondition before the corresponding PR begins. Each maps to a review finding from `docs/handover/2026-04-16-memory-v2-split-handover.md` §"Review findings still open".

1. **Gate 1 — v2a bake window (BLOCKS ALL v2b PRs).**
   - Pass: v2a is shipped, deployed across at least 1 internal workspace, and has run for ≥2 wall-clock weeks without rollback.
   - Fail: any v2a rollback within the bake window resets the timer to zero.
   - Source: `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` §"v2b prerequisites" line 200.

2. **Gate 2 — Identity decision (BLOCKS PR 10).**
   - Pass: a written user decision exists answering EITHER "update AGENTS.md to memory-first framing" OR "re-sequence v2b PRs so control-plane lands first." Decision recorded in `docs/decisions/` (or chosen ADR location) before PR 10 starts.
   - Fail: spec title still claims memory-first while AGENTS.md asserts control-plane-first; PR distribution is memory-heavy in conflict with AGENTS.md authority.
   - Source: handover §"Review findings still open" — product F2; `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` line 203.
   - Rationale: if AGENTS.md is authoritative, PR 10 (control-plane graph) is the v2b headline and should be sequenced first; if memory-first is authoritative, PR 10 sequencing is fine but AGENTS.md must be updated. Planning cannot resolve this — surfaced as Open Question #1.

3. **Gate 3 — 249-session offline Dreaming threshold sweep (BLOCKS PR 11).**
   - Pass: §12.2 offline sweep run on imported sessions; promotion-rate report produced; report flagged for **explicit user approval** before PR 11 starts. Approval form: a written sign-off (issue, ADR, or recorded meeting note) saying either "thresholds OK as-is" or "thresholds tuned to {new values}, re-run sweep to confirm."
   - Fail: report not produced, OR user reviews report and judges promotion rate insufficient → rework thresholds and re-run sweep, OR rescope PR 11 to "promotion-pipeline scaffolding without cron" if even tuned thresholds don't yield a useful rate.
   - **Why no numeric threshold:** the prior "<5%" cut-off was never anchored in a primary source (originated in the handover, not in Part 06 §8 or manifest B.4). A human-judgment gate is honest about the actual constraint: code-agent workloads are a new domain for the prior art thresholds and the right cut-off is empirical, not pre-decidable.
   - **Escalation owner:** the engineer running the sweep produces the report and tags the user (Mo) for sign-off. If sign-off is not granted within 1 week, PR 11 is rescoped to scaffolding-only and Gate 3 stays open.
   - Source: handover §"Review findings still open" — adversarial F3; product F6; `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md` §8; v2b review P0-3 mitigation.

4. **Gate 4 — Fulcrum-specific recall eval design (BLOCKS PR 14).**
   - Pass: a code-change-memory benchmark is designed and a baseline corpus checked in to `packages/memory/src/eval/fulcrum-recall/` BEFORE LongMemEval harness lands. Eval covers code-agent retrieval (file-edit recall, decision-recall after multi-turn coding), not just conversational memory.
   - Fail: ported prior art LongMemEval is the only bench → goal is warped per product F7.
   - Source: handover §"Review findings still open" — product F7; `docs/brainstorms/2026-04-16-memory-architecture-v2/07-acceptance-and-planning.md` §11.35; `docs/research/memory-patterns-sanitizer-escalation.md` §"Overview" 96.6% R@5 baseline.

5. **Gate 5 — Copilot user request capture (BLOCKS PR 18).**
   - Pass: at least one user request for Copilot integration documented in an issue, support ticket, or recorded meeting note before PR 18 begins.
   - Fail: zero user requests → defer PR 18 indefinitely; do not invest researcher-enthusiasm hours.
   - Source: handover §"Review findings still open" — product F4; `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` line 204.

## Architecture Decisions

### Carried forward from v2a (DO NOT re-litigate)

1. **PCI watcher = per-dir `fs.watch` (prior-art style).** v2a PR 4 locked the topology. v2b's git ingestion (PR 10) and external-sync writers (PR 20) integrate with the same watcher topology — no second watcher. Source: handover §"Outstanding architectural decisions" #1; `docs/research/code-search-patterns.md` lines 107–119 prior-art `fs.watch` rationale.
2. **Hybrid fusion = RRF (k=60).** Stays in `packages/memory/src/scoring.ts` `rrfScore` / `rrfFuse`. prior art weighted-sum (`0.6 vec + 0.4 bm25_norm`, `docs/research/memory-patterns-sanitizer-escalation.md` §"Retrieval pipeline") is a v2b ablation candidate ONLY if Gate 4's eval shows degradation; not a default task.
3. **`memories.kind` validation lives in `packages/memory/src/write.ts`.** v2a dropped the SQL CHECK constraint. v2b's new kinds (`entity`, `edge`, `agent_card`, `policy_event`, `external_ref`, `git_commit`, `git_branch`, `git_pr`, `git_tag`, `agent_adapter`, `artifact_contract`, `notification_event`) extend the app-level validator list — they do NOT touch the SQLite schema.
4. **Kuzu schema extends from v2a's Memory + Entity + File + CodeChunk + Symbol nodes.** v2b PR 10 ADDS ~17 more node types and ~25 more rel tables. Per adversarial F1, this is realistic 2 weeks, NOT 4 days. Source: `packages/memory/src/kuzu/schema.ts` (v2a baseline); handover §"Review findings still open" — adversarial F1.
5. **`FULCRUM_MEMORY_V2=1` flag stays on through v2b.** PR 21 removes it after the v2b bake window. Source: `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md` §10 lines 160–168.
6. **Session-scope storage already exists in v2a (persisted in central SQLite).** v2b extends `scope` enum with `'global'` only — no schema change to the session row layout. Source: handover §"Outstanding architectural decisions" #8.

### New v2b decisions (open questions resolved here)

- **§12.6 `memories.kind` open enum shape:** stays TEXT in SQLite, validated in `packages/memory/src/write.ts`. v2b extends the validator's allowlist. No CHECK widening, no kinds table. (Carries v2a precedent.)
- **§12.12 Global-scope role policy:** `chief_of_staff` ALLOWED across workspaces by default; `software_engineer` / `test_engineer` / `reviewer` DENIED to other workspaces (allowed in their own workspace only). Configurable via `policy_rules` table; PR 12 adds the rule rows. Source: `docs/brainstorms/2026-04-16-memory-architecture-v2/07-acceptance-and-planning.md` §12.12.
- **§12.26 Git ingestion strategy:** option (a) periodic `git log` walker via Dreaming light phase + option (b) post-commit hook that calls `fulcrum action exec record_commit`. Option (c) `fulcrum git backfill` for initial backfill. Implemented in PR 10's git-reducer task and PR 20's external-sync work.
- **§12.27 External-sync cadence:** webhook-driven for Plane / GitHub PRs (real-time consistency); poll-based for Jira (5-min cadence) until a webhook adapter is requested. PR 20 task.
- **§12.28 Adapter identity:** `agent_adapter.id` = `{executor_uri}:{model}:{version}` tuple, hashed via sha256 (truncate to 32 chars) — stable across restarts, monotonically updated when version bumps. PR 10 task.
- **§12.29 Graph query language on monitor:** Cypher (Kuzu-native), restricted to a read-only allowlist (no `LOAD CSV`, no filesystem-touching `CALL` subqueries). Allowlist enforced in `packages/monitor/src/graph-route.ts`. Source: `docs/brainstorms/2026-04-16-memory-architecture-v2/02-activation-and-inventory.md` line 234. PR 19 task.

## Critical Constraints (preserve verbatim — from handover §"Critical constraints")

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

## Standard Task Workflow (every task in this plan follows this lifecycle)

Same nine-step pattern as v2a (`docs/plans/2026-04-16-memory-v2a-plan.md` §"Standard Task Workflow"). Repeated here in tabular form so v2b agents don't need to cross-reference at task time. Skips are auditable defects.

**Exception: bootstrap PR.** PR 21 removes the `FULCRUM_MEMORY_V2` flag — every flag-conditional code path may behave differently mid-PR. For PR 21, the workflow drops the `mcp__fulcrum__*` lifecycle calls and uses external substitutes — see §"Bootstrap Mode" below. v2b otherwise has no bootstrap-risky PRs (everything else is additive on top of v2a's stabilized base).

| # | Step | Skill / MCP tool | Why |
|---|---|---|---|
| 1 | **Orient** | `mcp__fulcrum__build_cos_context`, `mcp__fulcrum__get_workspace_status`, `mcp__fulcrum__recall_memory query=<task topic>` (always include `tags=['v2a-v2b-handoff']` for v2b tasks) | Pull v2a-handoff decisions + world-state before touching code. |
| 2 | **Load context** | `agent-skills:context-engineering` | v2b's context surface is broader (51-table graph, 6 hosts, 2-week bake). Load once per task; refuses guess-work. |
| 3 | **Source-verify libraries** | `agent-skills:source-driven-development` + `find-docs <library>` (or `mcp__mcpmu__context7--query-docs`) | v2b adds Kuzu Cypher, monitor HTTP endpoints, A2A card schemas, plugin manifests. Every external API contact requires a docs round-trip. |
| 4 | **Open run** | `mcp__fulcrum__start_agent_run` with `agent_role`, `task_id`, `context_type='primary'` | Lifecycle row created. |
| 5 | **TDD slice** | `agent-skills:test-driven-development` then `agent-skills:incremental-implementation` | v2b's reducers fan out across 18 node tables — slice by table, not by file. |
| 6 | **Heartbeat** | `mcp__fulcrum__heartbeat_agent_run` every ~30s (PR 10 + PR 11 are long; heartbeats matter) | Prevents stale-run sweeper from killing the row mid-DDL. |
| 7 | **Build / verify** | `agent-skills:build` + the task's `Verify:` command | Plus `pnpm --filter fulcrum-memory vitest run src/eval/` for any retrieval-touching PR. |
| 8 | **Self-review** | `agent-skills:review` (5-axis) | Catch obvious before requesting human review. |
| 9 | **Close run + record decision** | `mcp__fulcrum__complete_agent_run` (`output_summary` + `artifact_paths`); `mcp__fulcrum__write_memory` `kind='decision'` for any non-obvious choice | v2b decisions are foundational for the next 2 years. Capture them. |

**On block:** `mcp__fulcrum__block_agent_run` with explicit `reason`; if blocked by an unmet gate, link the gate ID.

**On error:** `agent-skills:debugging-and-error-recovery` (reproduce → localize → fix → guard with regression test).

## Bootstrap Mode (the one v2b PR that rewrites its own dogfooding contract)

v2b has only one bootstrap-risky PR: **PR 21 (flag removal)**. v2a's bootstrap PRs (1, 2, 5, 6) already shipped before v2b begins, so the memory write/read path is stable for the rest of v2b. PR 21 is risky because removing `FULCRUM_MEMORY_V2` changes behavior across every flag-conditional branch in `packages/`; an `mcp__fulcrum__*` call mid-PR may hit a half-removed branch.

**Rule:** during PR 21, drop the `mcp__fulcrum__*` lifecycle calls from steps 1, 4, 6, 9 of the Standard Task Workflow. Use the external substitutes below. Skills and built-in tools stay in.

| PR | Why it's bootstrap-risky | Replace `mcp__fulcrum__*` with |
|---|---|---|
| PR 21 — Flag removal | Removing `FULCRUM_MEMORY_V2` changes behavior on every flag-conditional branch; if any branch is half-removed, `mcp__fulcrum__*` calls behave differently across invocations | git for branching/commits; `Bash` + `Read`/`Edit`/`Write`/`Grep` for code (use `grep -rn FULCRUM_MEMORY_V2` repeatedly to track removal progress); Claude Code skills (`agent-skills:deprecation-and-migration` is the driving skill); `docs/decisions/` for the removal record. |

**Bootstrap-mode entry checkpoint** (BEFORE PR 21 opens):
- Capture `mcp__fulcrum__get_workspace_status` JSON snapshot to `docs/decisions/2026-04-XX-pr-21-bootstrap-entry.json`
- Capture `mcp__fulcrum__list_tasks status=in_progress` snapshot
- Capture three v2b bake snapshots (PR 20 merge-day + bake-day-7 + bake-day-14) — these double as PR 21's gate evidence and bootstrap entry state.

**Bootstrap-mode exit checkpoint** (AFTER PR 21 merges, BEFORE declaring v2b complete):
- Smoke-test: `mcp__fulcrum__write_memory` + `recall_memory` round-trip, asserting both succeed AND that `grep -rn FULCRUM_MEMORY_V2 packages/ agent-integration/ docs/` returns zero hits
- Smoke-test: `start_agent_run` + `complete_agent_run` round-trip on a fresh task
- Failure here = release blocker; rollback PR 21 (re-introduce flag) and rework

**What stays safe in every v2b PR including PR 21:**
- Built-in tools: `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `TaskCreate`, `TaskUpdate`
- Claude Code skills: `agent-skills:*`, `compound-engineering:*`, `find-docs`
- Git directly (`git` / `gh` CLI)
- Third-party MCP: `mcp__mcpmu__*`, `mcp__claude_ai_*`

**Why PRs 10–20 are NOT bootstrap-risky:** they ADD tables, ADD endpoints, ADD reducers, ADD CLI surfaces — they do not REWRITE the v2a write/read path. The v2a stabilized contract holds throughout. Engineers working on PRs 10–20 use the full Standard Task Workflow including all `mcp__fulcrum__*` calls, and dogfooding the v2a path is actively desirable (it surfaces v2a regressions early).

## Per-PR Quality Gates

### Always-on gates (every PR)

- [ ] All tasks for the PR have `mcp__fulcrum__update_task(status='completed')`.
- [ ] All `Verify:` commands pass on a clean checkout.
- [ ] **All applicable prerequisite gates are confirmed-clear at PR-open time** (re-check; gates can re-close if v2a rolls back during bake).
- [ ] `agent-skills:code-review-and-quality` (multi-axis review) passes.
- [ ] `compound-engineering:ce-review` tiered persona pass on the diff.
- [ ] `compound-engineering:ce-pr-description` produces the PR description.
- [ ] `compound-engineering:git-commit-push-pr` (or `compound-engineering:git-commit` + manual push) creates the commit + PR.
- [ ] `mcp__fulcrum__write_memory` records the PR's headline decision with `kind='decision'`, tags `['v2b', 'pr-N']`.
- [ ] No new TypeScript errors; no new lint warnings; no `--no-verify`.

### Conditional gates

| Trigger | Required skill / check |
|---|---|
| PR touches Kuzu DDL (PRs 10, 11) | `find-docs Kuzu` (version-pinned) + temp-DB DDL round-trip per node/rel table; **additive-only DDL audit** (cross-plan review P1-3): re-run v2a's `buildAllDDL()` then v2b's extension on a populated v2a Kuzu DB — assert zero rebuild. |
| PR touches global-scope / role policy / `policy_rules` table (PR 12) | `agent-skills:security-and-hardening` + `security-review` skill on the diff; explicit fail-closed test for missing policy rows (v2b review P1-5). |
| PR touches Dreaming thresholds / promotion (PR 11) | Sweep report from Gate 3 attached to the PR; `agent-skills:performance-optimization` for promotion-rate baseline. |
| PR touches monitor / dashboard / `/graph` endpoints (PR 19) | `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser`; **Cypher allowlist test** asserting write statements + `LOAD CSV` + filesystem `CALL` are rejected (v2b critical constraint #9 + open question #2). |
| PR touches eval harness (PR 14) | `agent-skills:test-driven-development` — eval IS the test; design must be reviewed BEFORE implementation per Gate 4. |
| PR touches per-host plugin (PRs 17, 18) | `superpowers-developing-for-claude-code:developing-claude-code-plugins` for Claude marketplace bundle (PR 17 §11.60); `find-docs github-copilot` for Copilot integration (PR 18). |
| PR removes the `FULCRUM_MEMORY_V2` flag (PR 21) | `agent-skills:deprecation-and-migration` — pre-flight checklist + grep verification that no flag references remain in `packages/`, `agent-integration/`. |
| PR opens a new MCP tool / CLI action (PRs 12, 13, 19) | `agent-skills:api-and-interface-design` (stable contract + versioning + deprecation path) + register in `tool-registry.ts` + parity test (CLI ↔ MCP). |

## Skill + MCP tool index (where in the plan each is used)

| Skill / Tool | Used by |
|---|---|
| `agent-skills:test-driven-development` | Every task. |
| `agent-skills:source-driven-development` + `find-docs` / `context7` | PRs 10 + 11 (Kuzu DDL semantics), PR 13 (`code_context` graph traversal), PR 17 (Gemini hooks), PR 18 (Copilot integration paths), PR 19 (Cypher allowlist patterns). |
| `agent-skills:security-and-hardening` + `security-review` | PR 12 (global scope policy + missing-rule fail-closed), PR 19 (Cypher allowlist + monitor loopback enforcement), PR 15 (context-type audit + WAL replay). |
| `agent-skills:deprecation-and-migration` | PR 16 (Pi npm publish), PR 21 (flag removal). |
| `agent-skills:performance-optimization` | PR 11 Dreaming promotion-rate calibration; PR 14 Fulcrum-eval baseline; PR 20 git ingestion throughput. |
| `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` | PR 19 Task 10.4 (monitor Graph tab — neighborhood-explorer rendering, Cypher input box, force-directed layout). |
| `agent-skills:api-and-interface-design` | PRs 12, 13, 17, 18 (every new MCP tool / CLI action / plugin manifest). |
| `agent-skills:debugging-and-error-recovery` | Reducer-failure isolation tests (P1-4); divergence-monitor calibration. |
| `agent-skills:incremental-implementation` | Every task. PR 10 in particular: slice by node table, not by file. |
| `agent-skills:code-review-and-quality` + `compound-engineering:ce-review` | Every PR. |
| `agent-skills:documentation-and-adrs` | Identity decision (Gate 2) ADR; Cypher allowlist depth-limit ADR (PR 19 open question); Copilot capture-mechanism ADR (Gate 5). |
| `superpowers-developing-for-claude-code:developing-claude-code-plugins` | PR 17 Task 8.3 (Claude marketplace bundle). |
| `compound-engineering:document-review` (mode:headless) | Final pass on this plan once all gates clear; on each new ADR. |
| `mcp__fulcrum__create_task` | At each PR's kickoff. |
| `mcp__fulcrum__start_agent_run` / `heartbeat_agent_run` / `complete_agent_run` / `block_agent_run` | Every task execution. |
| `mcp__fulcrum__write_memory` | After every PR; after every gate sign-off; after every ADR. |
| `mcp__fulcrum__recall_memory query='v2a v2b handoff <topic>'` | At each v2b task start. |
| `mcp__fulcrum__build_cos_context` | At plan kickoff and at each Phase boundary. |
| `mcp__fulcrum__get_workspace_status` | Daily; especially during v2a bake (Gate 1 evidence). |
| `mcp__fulcrum__list_team_templates` / `invoke_team` | If PR scope demands a multi-role team (e.g., PR 17 per-host enhancements may invoke a per-host team template). chief_of_staff role only. |

## Task List (per-PR roadmap)

### Phase 1: PR 10 — Full Kuzu DDL + control-plane reducer (~2 weeks)

Adversarial F1 mandates this is realistic 2 weeks, not 4 days. PR 10 is the v2b foundation; PRs 13, 19, 20 all consume it.

**Mandatory skills:** `find-docs Kuzu` (or `mcp__mcpmu__context7--query-docs` for `/kuzudb/kuzu`) at the start of EVERY task in this PR — Kuzu's DDL syntax, vector-index API, and Cypher subset shift between minor versions; the v2a PR 7 work was done weeks ago and the pinned version may have moved during the v2a bake. `agent-skills:source-driven-development` to verify additive-DDL semantics on a populated v2a Kuzu DB before authoring v2b tables (cross-plan review P1-3 mitigation). `agent-skills:incremental-implementation` to slice this PR by **node table**, not by file — one DDL + one reducer + one round-trip test per slice; never batch DDLs.

- [ ] Task 1.1: Author Kuzu DDL for control-plane node types
  - Acceptance: `packages/memory/src/kuzu/schema.ts` exports `buildControlPlaneDDL(dims)` returning DDL for 18 new node types (`task`, `agent_run`, `team_instance`, `team_template`, `workflow_run`, `handoff`, `artifact`, `review`, `worktree`, `epic`, `issue`, `prd`, `plan`, `external_ref`, `agent_adapter`, `artifact_contract`, `notification_event`, `policy_event`). `team_members` is modeled as a rel table (see Task 1.3), not a node, so it is not in the count. Each DDL includes `id STRING PRIMARY KEY`, `workspace_id STRING`, `project_id STRING`, plus per-node fields per Part 06 §8.1 grouping. (v2b review P1-2 mitigation: count is 18, not 17.)
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/tests/control-plane-ddl.test.ts` — asserts each DDL parses via Kuzu client and creates the table on a temp DB.
  - Files: `packages/memory/src/kuzu/schema.ts`, `packages/memory/src/kuzu/tests/control-plane-ddl.test.ts`
  - Prerequisite gate: Gate 1 (v2a bake), Gate 2 (identity decision)
  - Maps to AC: §11.49 (adapter telemetry), §11.54 (policy audit), §11.55 (team membership traversal), §11.56 (artifact conformance), §11.59 (orthogonal tables absent)
  - Cites research: `docs/research/code-search-patterns.md` §"Files Worth Copying" anchor-chunk pattern (used as model for finite control-plane node set)

- [ ] Task 1.2: Author Kuzu DDL for git node types
  - Acceptance: `packages/memory/src/kuzu/schema.ts` adds `buildGitDDL()` returning DDL for `git_commit`, `git_branch`, `git_pr`, `git_tag` node types with fields per Part 02 §"Git objects" lines 178–192.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/tests/git-ddl.test.ts`
  - Files: `packages/memory/src/kuzu/schema.ts`, `packages/memory/src/kuzu/tests/git-ddl.test.ts`
  - Prerequisite gate: Gate 1, Gate 2
  - Maps to AC: §11.48 (git PR → code chain navigable)
  - Cites research: `docs/brainstorms/2026-04-16-memory-architecture-v2/02-activation-and-inventory.md` §"Git objects" lines 175–192

- [ ] Task 1.3: Author Kuzu DDL for ~25 new rel tables
  - Acceptance: `packages/memory/src/kuzu/schema.ts` adds rel-table DDLs for: `assigned_to` (task→agent_run), `blocked_by` (task→task), `delivered_by` (task→artifact), `depends_on` (task→task), `has_outcome` (task→memory), `produced` (run→memory), `edited` (run→file), `handled` (run→handoff), `part_of` (run→team_instance), `hit` (run→hook_event), `instantiated_from` (team_instance→team_template), `executed_by` (run→agent_adapter), `member_of` (agent_profile→team_instance, with `role_slot` property), `landed_in` (file_patch→git_commit), `on` (git_commit→git_branch), `includes` (git_pr→git_commit), `delivered_in` (artifact→git_pr), `points_at` (worktree→git_branch), `shadow_of` (task→external_ref), `conforms_to` (artifact→artifact_contract), `checks` (review→artifact_contract), `evaluated` (policy_event→policy_rule), `decided_on` (policy_event→{tool_call|run|team}), `triggered_by` (notification_event→agent_run), `ran_as` (workflow_run→workflow_template).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/tests/control-plane-edges.test.ts` — asserts every rel table parses + can insert at least one row via Kuzu client.
  - Files: `packages/memory/src/kuzu/schema.ts`, `packages/memory/src/kuzu/tests/control-plane-edges.test.ts`
  - Prerequisite gate: Gate 1, Gate 2; Task 1.1 + 1.2 must land first
  - Maps to AC: §11.55 (team membership traversal), §11.56 (artifact conformance)
  - Cites research: `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md` §8.1 lines 86–98 (full edge taxonomy)

- [ ] Task 1.4: Add `buildAllDDL()` v2b superset wrapping all new tables
  - Acceptance: `packages/memory/src/kuzu/schema.ts` `buildAllDDL(dims)` (the existing v2a function) is extended to invoke `buildControlPlaneDDL(dims)` + `buildGitDDL()` + the new rel-table DDLs after the existing Memory + Entity + File + CodeChunk + Symbol set. Order preserved: nodes first, rels second, vector indexes last.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/tests/all-ddl-v2b.test.ts` — runs the full DDL on a fresh Kuzu DB and asserts every node + rel table exists post-init.
  - Files: `packages/memory/src/kuzu/schema.ts`
  - Prerequisite gate: Gate 1, Gate 2; Tasks 1.1–1.3
  - Maps to AC: §11.58 (event-bus taxonomy enforced — DDL precondition)

- [ ] Task 1.5: Implement graph reducer registry + per-edge reducer functions
  - Acceptance: `packages/core/src/event-bus.ts` exports a `registerGraphReducer(eventType, reducerFn)` API. New file `packages/memory/src/kuzu/reducers/index.ts` registers one reducer per event from Part 02 §"Event bus taxonomy" lines 318–337. Each reducer is a pure function `(event) → UpsertNode[] | UpsertEdge[]` per Part 06 §8.1 line 112. Errors logged via `fulcrum-core/logger`; never throw (prior art failure-isolation invariant).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/reducers/tests/registry.test.ts` — asserts a planted error in one reducer does not affect other reducers' execution and emits a `reducer_error` log line.
  - Files: `packages/core/src/event-bus.ts`, `packages/memory/src/kuzu/reducers/index.ts`, `packages/memory/src/kuzu/reducers/tests/registry.test.ts`
  - Prerequisite gate: Gate 1, Gate 2; Task 1.4
  - Maps to AC: §11.58 (event-bus taxonomy enforced — every event has registered reducer constant)
  - Cites research: `docs/research/memory-reference-patterns-local.md` lines 39–46 (failure-isolated provider fan-out pattern)

- [ ] Task 1.6: Wire reducer batching + backpressure
  - Acceptance: reducer dispatcher batches up to 64 events per Kuzu transaction OR flushes every 250ms (whichever first). Backpressure: if Kuzu writes lag >5 sec, log `reducer_lag` warning + buffer up to 1024 events; beyond that, drop oldest with `reducer_overflow` error.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/reducers/tests/batching.test.ts` — fires 200 events in a tight loop and asserts (a) Kuzu sees them all batched, (b) lag warning fires when Kuzu is slowed via a stub.
  - Files: `packages/memory/src/kuzu/reducers/dispatcher.ts`, `packages/memory/src/kuzu/reducers/tests/batching.test.ts`
  - Prerequisite gate: Gate 1, Gate 2; Task 1.5
  - Maps to AC: §11.58 (taxonomy enforced — performance precondition)
  - Risk addressed: adversarial F11 (reducer subscription cost — bounded throughput)

- [ ] Task 1.7: Add SQLite ↔ Kuzu cross-store divergence monitor
  - Acceptance: new `fulcrum action exec graph_consistency_check` walks 100 random rows from `tasks` / `agent_runs` / `team_instances` SQLite tables and asserts each has a corresponding Kuzu node; reports divergence count. Run via cron daily; alerts on >0.1% drift.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/tests/divergence-monitor.test.ts` — plants a deletion in Kuzu without removing the SQLite row and asserts the action reports drift.
  - Files: `packages/memory/src/kuzu/divergence-monitor.ts`, `packages/cli/src/actions/graph-consistency-check.ts`, `packages/memory/src/kuzu/tests/divergence-monitor.test.ts`
  - Prerequisite gate: Gate 1, Gate 2; Task 1.6
  - Maps to AC: §11.58 (taxonomy enforced)
  - Risk addressed: adversarial F14 (graph reducer fail-silent silently corrupts Kuzu)

- [ ] Task 1.8: Extend `memories.kind` app-level validator with v2b kinds
  - Acceptance: `packages/memory/src/write.ts` `validateKind()` allowlist adds: `entity`, `edge`, `agent_card`, `policy_event`, `external_ref`, `git_commit`, `git_branch`, `git_pr`, `git_tag`, `agent_adapter`, `artifact_contract`, `notification_event`. No SQLite schema change.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/write-kind-validator.test.ts` — round-trips each new kind through `writeMemory()` and asserts the row persists.
  - Files: `packages/memory/src/write.ts`, `packages/memory/src/tests/write-kind-validator.test.ts`
  - Prerequisite gate: Gate 1, Gate 2
  - Maps to AC: §11.49 (adapter telemetry — kind=`agent_adapter`)

### Phase 2: PR 11 — Dreaming light + REM + deep + procedural memory proposals (~1.5–2 weeks)

**Mandatory skills:** Gate 3 (249-session sweep) sign-off **MUST** be attached to this PR's description before any task starts. `agent-skills:performance-optimization` for promotion-rate calibration after the sweep. `agent-skills:security-and-hardening` for the re-sanitize boundary (Task 2.3 deep phase appends to host MEMORY.md / GEMINI.md — re-sanitize via `sanitizeOnWrite` before append per security review finding #5). `find-docs prior art` against `/home/mkh/workspace/prior-art/` for `dreaming-phases.ts` API verification.

**Note:** scope-split.md was updated post-review (cross-plan P0-1 mitigation) so Dreaming now ships entirely in v2b PR 11 — v2a only ships the schema scaffolding (`embedded`, `supersedes`, `recall_count`, `unique_query_count`, `max_recall_score`, `last_recalled_at` columns + `memory_recall_events` ledger). PR 11 implements the full light/REM/deep pipeline + the `fulcrum dream` CLI surface + procedural-memory proposals + re-sanitize at promotion boundary (security review finding #5). Effort revised to 1.5–2 weeks (was understated at 1 week; covers light-phase implementation absorbed from v2a).

- [ ] Task 2.0: Add `fulcrum dream` CLI scaffold + light-phase implementation
  - Acceptance: `fulcrum dream --phase={light|REM|deep|all}` registered as operator-only CLI (NOT in `fulcrum action exec` — Dreaming is a maintenance op, not an agent action). Light-phase implementation: scans `memory_recall_events` from the last 24h, computes per-memory `score = α·recall_count + β·unique_query_count + γ·max_recall_score` against manifest B.4 thresholds (`minRecallCount ≥ 3`, `minUniqueQueries ≥ 2`, `minScore ≥ 0.75`), produces a `light_dangling_links.md` report listing short-term entries with no incoming wikilinks. No promotion at this phase — light is observation-only.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/light-phase.test.ts src/cli/tests/dream-cli.test.ts` — seeds short-term entries with varying recall signals; asserts the dangling-links report is written and contains expected slugs.
  - Files: `packages/memory/src/dreaming/light-phase.ts` (new), `packages/cli/src/index.ts` (CLI registration), `packages/memory/src/dreaming/tests/light-phase.test.ts`, `packages/cli/src/tests/dream-cli.test.ts`
  - Prerequisite gate: Gate 1, Gate 3 (249-session sweep approval)
  - Maps to AC: §11.15 (Dreaming light dangling-link report)
  - Cites research: `docs/research/memory-retrieval-primitives-local.md` §"Promotion scoring"; manifest B.4 thresholds; v2b review P0-1 / cross-plan review P1-2 mitigation (CLI surface ownership)

- [ ] Task 2.1: Port prior art `dreaming-phases.ts` REM entity extraction
  - Acceptance: `packages/memory/src/dreaming/rem-extract.ts` clusters short-term memory entries by topic (FTS similarity), extracts entity mentions (people, libraries, services, files, decisions) per Part 06 §8 line 46, writes results to `{globalDataDir()}/memory/dreaming/REM/YYYY-MM-DD.md`. NLP-light: regex + entity-list lookup, no LLM call.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/rem-extract.test.ts` — seeds 50 short-term entries and asserts ≥10 entity nodes appear in Kuzu after `fulcrum dream --phase=REM`.
  - Files: `packages/memory/src/dreaming/rem-extract.ts`, `packages/memory/src/dreaming/tests/rem-extract.test.ts`
  - Prerequisite gate: Gate 1, Gate 3; Task 2.0
  - Maps to AC: §11.5 (Dreaming deep-phase promotion — REM is the entity-extraction step that feeds deep), §11.14 (post-Dreaming `embedded=1` invariant — REM marks promoted entries embedded), §11.16 (supersession edges via `supersedes`)
  - Cites research: `docs/research/memory-retrieval-primitives-local.md` lines 142–144 (`dreaming-phases.ts` ADAPT plan)

- [ ] Task 2.2: Wire Kuzu node + rel writes from REM extraction (reuse v2a PR 7's Memory↔code reducer)
  - Acceptance: REM extraction emits `entity_extracted` events on the event bus; reducers from PR 10 Task 1.5 upsert **Entity-side** nodes + `MENTIONS` / `ABOUT` rel rows. **Memory↔code edges (`MENTIONS_SYMBOL`, `ABOUT_FILE`, `ABOUT_SYMBOL`) reuse v2a PR 7 Task 38's `packages/memory/src/kuzu/reducers/memory.ts`** — no second reducer for those edge tables. Cross-plan review P1-3 mitigation: PR 10 Task 1.5 explicitly leaves Memory↔code edges to the existing v2a reducer; PR 11 Task 2.2 only adds Entity-side reducer logic.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/rem-graph-population.test.ts` — runs REM phase, queries Kuzu for `MENTIONS` + `ABOUT` edges from new memories, asserts >0 edges per processed entity AND zero duplicates against v2a-reducer-written rows.
  - Files: `packages/memory/src/dreaming/rem-extract.ts`, `packages/memory/src/dreaming/tests/rem-graph-population.test.ts`
  - Prerequisite gate: Gate 1, Gate 3; Task 2.1; PR 10 Tasks 1.5 + 1.6
  - Maps to AC: §11.5 (Dreaming deep-phase populates entity graph); §11.20 (`code_context(symbol)` returns durable memories via `about` / `mentions` edges — graph precondition)

- [ ] Task 2.3: Implement procedural-memory proposal pipeline + deep-phase promotion + re-sanitize at boundary
  - Acceptance: when REM detects a recurring pattern (sequence of `decision` + `file_patch` memories that form a repeatable procedure across ≥3 occurrences), writes `{globalDataDir()}/memory/dreaming/proposed_skills/<slug>.md` per Part 06 §8.2. Proposals are human-review only; no auto-promotion. Deep phase: short-term entries clearing the promoted thresholds (Gate 3 sign-off determines the values) are re-read from L0 vault, **re-sanitized via `sanitizeOnWrite`** (security review finding #5), and copied to host MEMORY.md / GEMINI.md / etc. Promoted entries get `embedded=1` (§11.14).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/procedural-proposals.test.ts src/dreaming/tests/deep-phase-promotion.test.ts` — seeds a recurring decision-then-edit pattern across 3 sessions, runs REM + deep, asserts a proposal markdown is written and promoted entries have `embedded=1`. Deep test asserts re-sanitize fires (injected payload in vault file is stripped before host MEMORY.md append).
  - Files: `packages/memory/src/dreaming/procedural-proposals.ts`, `packages/memory/src/dreaming/deep-phase.ts` (new), `packages/memory/src/dreaming/tests/procedural-proposals.test.ts`, `packages/memory/src/dreaming/tests/deep-phase-promotion.test.ts`
  - Prerequisite gate: Gate 1, Gate 3 (must be SIGNED OFF — thresholds locked); Task 2.1
  - Maps to AC: §11.5 (Dreaming deep-phase promotion), §11.14 (post-Dreaming `embedded=1`)
  - Cites research: `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md` §8.2 lines 140–142; security review finding #5 (re-sanitize boundary)

### Phase 3: PR 12 — Global pointer + `scope: 'global'` (~3 days)

Lights up cross-workspace recall; prerequisite is PR 11's REM phase populating the pointer collection.

**Mandatory skills:** `agent-skills:security-and-hardening` + `security-review` skill on the diff — this PR is the one that authorizes cross-workspace data flow. Every code path in this PR is a potential auth-bypass. Fail-closed test for missing policy rows (Task 3.3). `agent-skills:api-and-interface-design` for the new `fulcrum policy rules {list|enable|disable}` CLI (absorbed from v2a's deferred §11.42) and for the `list_activations` MCP tool (Task 3.5).

- [ ] Task 3.1: Implement global pointer collection writer in REM phase
  - Acceptance: `packages/memory/src/dreaming/global-pointer.ts` writes `{globalDataDir()}/memory/dreaming/global_index.md` per Part 06 §8.3 lines 124–138. Each line: `topic | entities | kind | memory_slug | workspace_id/project_id | score`. Max ~2000 lines; oldest + lowest-utility pruned. Updated incrementally per new durable entry.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/global-pointer.test.ts` — promotes 10 durable entries across 2 workspaces, runs REM, asserts pointer file lines = 10 with correct workspace IDs.
  - Files: `packages/memory/src/dreaming/global-pointer.ts`, `packages/memory/src/dreaming/tests/global-pointer.test.ts`
  - Prerequisite gate: Gate 1, Gate 3; PR 11 Task 2.1
  - Maps to AC: §11.31 (global pointer pre-filter)
  - Cites research: `docs/research/memory-patterns-sanitizer-escalation.md` §"Closet" pattern lines 68–72

- [ ] Task 3.2: Apply file-level ACL to `global_index.md` (security F7)
  - Acceptance: `global-pointer.ts` chmod's `global_index.md` to `0600` after write. README documents the choice (restrict perms vs strip workspace IDs); we restrict perms because workspace IDs are needed for routing.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/dreaming/tests/global-pointer-acl.test.ts` — runs writer; asserts `fs.statSync().mode & 0o777 === 0o600`.
  - Files: `packages/memory/src/dreaming/global-pointer.ts`
  - Prerequisite gate: Gate 1; Task 3.1
  - Maps to AC: §11.31

- [ ] Task 3.3: Add `scope: 'global'` to recall actions with role-policy gate (fail-closed on missing rule)
  - Acceptance: `packages/memory/src/recall.ts` accepts `scope: 'global'`. Before-query check (security F1 placement): role-policy lookup against `policy_rules` table. Default rule rows seeded by migration: `chief_of_staff` ALLOW; `software_engineer` / `test_engineer` / `reviewer` DENY (their own workspace only). **Missing-rule fallback (v2b review P1-5 mitigation):** if no `policy_rules` row exists for `(role, scope='global')`, **deny by default** (fail-closed) and emit a `policy_rule_missing` telemetry event with `{role, scope, ts}`. Unauthorized request returns `{results: [], reason: "policy_denied", policy_rule_id: <id>}`. Migration failure (partial seed) does NOT bypass to allow — fail-closed propagates.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/recall-global-scope.test.ts src/tests/recall-global-missing-policy.test.ts` — calls `recall_memory(query: "X", scope: "global")` once as `chief_of_staff` (asserts cross-workspace results), once as `software_engineer` (asserts policy_denied envelope), and once as a role with NO seeded policy row (asserts fail-closed deny + `policy_rule_missing` telemetry emitted).
  - Files: `packages/memory/src/recall.ts`, `packages/core/src/db/migrations/v2b_global_scope_policies.sql`, `packages/memory/src/tests/recall-global-scope.test.ts`, `packages/memory/src/tests/recall-global-missing-policy.test.ts`
  - Prerequisite gate: Gate 1; Tasks 3.1 + 3.2
  - Maps to AC: §11.29 (scope=global policy enforcement), §11.42 (policy rules registry — list/enable/disable surface lights up here as the role-policy CLI: `fulcrum policy rules {list|enable|disable}` reads/writes `policy_rules` table)

- [ ] Task 3.4: Wire global pointer pre-filter into recall path
  - Acceptance: `recall.ts` for `scope: 'global'` queries first probes `global_index.md` via FTS5 on `topic | entities` columns; if zero hits, short-circuits without fanning into full FTS+vec+graph. Returns `{results: [], reason: "no_pointer_match"}`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/global-pre-filter.test.ts` — calls global recall with a query absent from the pointer; asserts no full FTS/vec query was issued (assert via stub).
  - Files: `packages/memory/src/recall.ts`, `packages/memory/src/tests/global-pre-filter.test.ts`
  - Prerequisite gate: Gate 1; Task 3.3
  - Maps to AC: §11.31 (global pointer pre-filter)

- [ ] Task 3.5: Ship `list_activations` MCP tool + `fulcrum action exec list_activations` CLI
  - Acceptance: returns `{active_workflows: [...], active_teams: [...], active_runs: [...], policy_overrides: [...]}` for the current workspace. Read-only; no side effects. Surfaced both as MCP (`mcp__fulcrum__list_activations`) and CLI (`fulcrum action exec list_activations`). Round-trips current workspace activation state from `agent_runs` + `team_instances` + `workflow_runs` + `policy_rules` tables (all already populated by v2a + earlier v2b PRs).
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/list-activations.test.ts` — seeds an active run + team + workflow + policy override; calls the action; asserts all four appear in the response with correct shape.
  - Files: `packages/memory/src/recall.ts` (or new `packages/memory/src/list-activations.ts`), `packages/cli/src/tool-registry.ts`, `packages/memory/src/tests/list-activations.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.43 (`list_activations` MCP tool)
  - Cites research: scope-split.md round-2 update (deferred from v2a per user decision; lands here in PR 12 alongside policy-rule machinery)

### Phase 4: PR 13 — Cross-entity MCP tools (`code_context` + `project_context`) (~4 days)

Graduates v2a's degraded `project_context` (which was wired to `recall_memory` / `query_memory` / `search_code` per §11.40 v2a footnote) into the full cross-entity bundle.

- [ ] Task 4.1: Implement `code_context` action — graph-traversal cross-type
  - Acceptance: `packages/cli/src/actions/code-context.ts` accepts `{symbol|file, scope, limit}`, traverses Kuzu from the seed code node returning callers + callees + imports + nearest-neighbor chunks + memories reachable via `about` / `mentions` / `edits` edges. Response shape: `{seed, callers, callees, imports, chunks, memories}` — each filtered to N most relevant (default 10) via RRF over graph paths.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/code-context.test.ts` — seeds a chunk with a known `about` decision and asserts `code_context(symbol: X)` returns both the chunk neighbors AND the decision memory.
  - Files: `packages/cli/src/actions/code-context.ts`, `packages/memory/src/recall.ts`, `packages/memory/src/tests/code-context.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.4 complete
  - Maps to AC: §11.20 (code_context returns reachable memories), §11.23 (Kuzu graph unifies memory + code)

- [ ] Task 4.2: Implement `project_context` action — cross-entity bundle
  - Acceptance: `packages/cli/src/actions/project-context.ts` accepts `{task_id|run_id|file|symbol|pr_number|issue_id, scope, limit}`. Returns the bundle shape from Part 02 §"Control-plane unification" line 64: `{memories, code_chunks, tasks, runs, artifacts, handoffs, team_instances, workflow_runs, decisions, blockers, events}`. Each group filtered via RRF + graph traversal. **Empty groups absent from response (no null fields, no error metadata, no placeholders) per §11.40.**
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/project-context.test.ts` — calls `project_context(file: "X")` against (a) a cold install with no tasks → response omits `tasks` group entirely; (b) populated install → response includes all relevant groups.
  - Files: `packages/cli/src/actions/project-context.ts`, `packages/memory/src/tests/project-context.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.4 complete; Task 4.1
  - Maps to AC: §11.40 (project_context shape-stable; graduates from v2a degraded state to full)

- [ ] Task 4.3: Register `code_context` + `project_context` as CLI-first actions and selective MCP overlay
  - Acceptance: both actions registered in `packages/cli/src/tool-registry.ts` per `docs/plans/2026-04-16-cli-first-action-platform-plan.md` Phase 1. MCP tool entries appear under `mcp__fulcrum__code_context` / `mcp__fulcrum__project_context` only when `--mode filtered` is in the right profile (`software_engineer` for `code_context`; both profiles for `project_context`).
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/cli-coverage.test.ts src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/mcp-tools.ts`
  - Prerequisite gate: Gate 1; Tasks 4.1 + 4.2
  - Maps to AC: §11.40, §11.44 (CLI-first coverage), §11.46 (CLI/MCP parity)

### Phase 5: PR 14 — Fulcrum-specific recall eval + LongMemEval harness (~1 week)

Gate 4 mandates the Fulcrum-specific eval is designed and seeded BEFORE the LongMemEval harness lands.

- [ ] Task 5.1: Implement Fulcrum-specific code-change-memory benchmark harness
  - Acceptance: `packages/memory/src/eval/fulcrum-recall/harness.ts` exposes `runFulcrumEval(corpusPath, retriever)` returning `{r_at_5, r_at_10, mrr, latency_p95}`. Corpus shape: a sequence of code-edit events + decision writes + recall queries simulating a multi-day code-agent workflow. Initial corpus checked in to `packages/memory/src/eval/fulcrum-recall/corpus/v1/`.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/eval/fulcrum-recall/tests/harness.test.ts`
  - Files: `packages/memory/src/eval/fulcrum-recall/harness.ts`, `packages/memory/src/eval/fulcrum-recall/corpus/v1/seed.json`, `packages/memory/src/eval/fulcrum-recall/tests/harness.test.ts`
  - Prerequisite gate: Gate 1, Gate 4 (Fulcrum-specific eval design)
  - Maps to AC: §11.35 (REFRAMED — Fulcrum-specific floor replaces LongMemEval-only floor)
  - Cites research: `docs/research/memory-patterns-sanitizer-escalation.md` §"Overview" 96.6% R@5 baseline (acknowledged but explicitly NOT the goal per product F7)

- [ ] Task 5.2: Port prior art LongMemEval harness as secondary signal
  - Acceptance: `packages/memory/src/eval/longmemeval/` ships the 50/450 split + prior-run JSONLs per source inventory B.13. Runs as a SECONDARY signal (not the primary regression bench); explicitly labeled "conversational-memory benchmark" in eval output.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/eval/longmemeval/tests/harness.test.ts`
  - Files: `packages/memory/src/eval/longmemeval/harness.ts`, `packages/memory/src/eval/longmemeval/lme_split_50_450.json`, `packages/memory/src/eval/longmemeval/tests/harness.test.ts`
  - Prerequisite gate: Gate 1, Gate 4; Task 5.1 (Fulcrum eval lands first)
  - Maps to AC: §11.35 (secondary metric)
  - Cites research: `docs/research/memory-patterns-sanitizer-escalation.md` §"Retrieval pipeline" lines 86–92

- [ ] Task 5.3: Wire both eval harnesses as CI regression jobs
  - Acceptance: GitHub Actions / repo CI runs `pnpm --filter fulcrum-memory eval:fulcrum && pnpm --filter fulcrum-memory eval:longmemeval` nightly + on every PR touching `packages/memory/src/retrieval/`. Fulcrum-recall floor (per Gate 4 design): TBD by user (suggest R@5 ≥ baseline-5%); LongMemEval floor: R@5 ≥ 90% per §11.35 default.
  - Verify: `cat .github/workflows/memory-eval.yml | grep -E "eval:(fulcrum|longmemeval)"`
  - Files: `.github/workflows/memory-eval.yml`, `packages/memory/package.json`
  - Prerequisite gate: Gate 1, Gate 4; Tasks 5.1 + 5.2
  - Maps to AC: §11.35

- [ ] Task 5.4: Optional weighted-sum fusion ablation if eval shows degradation
  - Acceptance: ONLY if Task 5.3 baseline shows RRF underperforming prior art's `0.6 vec + 0.4 bm25_norm` by >2% R@5 — implement weighted-sum as `packages/memory/src/scoring/weighted-fusion.ts`, A/B against RRF in `recall.ts`, swap default if the win holds. SKIP THIS TASK if RRF wins or ties.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/scoring/tests/weighted-vs-rrf.test.ts`
  - Files: `packages/memory/src/scoring/weighted-fusion.ts`, `packages/memory/src/scoring.ts`, `packages/memory/src/scoring/tests/weighted-vs-rrf.test.ts`
  - Prerequisite gate: Gate 1, Gate 4; Tasks 5.1–5.3 — and EMPIRICAL trigger from Task 5.3
  - Maps to AC: §11.35
  - Cites research: `docs/research/memory-patterns-sanitizer-escalation.md` §"Retrieval pipeline" line 89

### Phase 6: PR 15 — Full context-type enforcement audit + WAL replay capability (~2 days)

- [ ] Task 6.1: Audit all `start_agent_run` call sites for explicit `context_type`
  - Acceptance: grep across `packages/cli/`, `packages/worker/`, `packages/teams/`, `packages/pi-cockpit/` (or wherever the cockpit lives) for `start_agent_run(`. Each call site passes `context_type` explicitly per critical constraint #7. Failing call sites updated in this task.
  - Verify: `rg -n "start_agent_run\\(" packages/ --type ts | rg -v "context_type"` returns zero matches.
  - Files: depends on grep results — at minimum touches the cockpit + cron dispatcher per Part 06 §7 line 27 (Pi hook surface)
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.32 (WAL replay capability — context_type is required for replay correctness)

- [ ] Task 6.2: Implement `normalize_version` background re-processor
  - Acceptance: `packages/memory/src/db/normalize-version.ts` (port of prior art `palace.py:50,313-343` per source inventory B.10) scans rows where `normalize_version < CURRENT_VERSION`, re-runs sanitize + chunker, updates rows. Runs as background queue triggered on MCP server start.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/db/tests/normalize-version-rebuild.test.ts` — bumps `CURRENT_VERSION`, asserts old rows are reprocessed within 60s of server start.
  - Files: `packages/memory/src/db/normalize-version.ts`, `packages/memory/src/db/tests/normalize-version-rebuild.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.33 (carry-forward, but the background rebuilder is v2b)
  - Cites research: `docs/research/memory-patterns-sanitizer-escalation.md` line 50 + 313 (NORMALIZE_VERSION pattern)

- [ ] Task 6.3: Implement `fulcrum memory replay-wal` command (operator-only)
  - Acceptance: `packages/cli/src/commands/memory-replay-wal.ts` walks `{globalDataDir()}/db/wal/*.jsonl` per Part 05 §5.6 (v2a foundation), re-derives memory rows from L0 vault + WAL records, asserts sha256 match against pre-loss content. Operator-only (NOT exposed via `fulcrum action exec`).
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/memory-replay-wal.test.ts` — writes a memory, deletes its L1 row, runs replay, asserts row is restored with matching content hash.
  - Files: `packages/cli/src/commands/memory-replay-wal.ts`, `packages/cli/src/tests/memory-replay-wal.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.32 (WAL replay round-trip)

### Phase 7: PR 16 — Pi cockpit npm publish (~2 days)

- [ ] Task 7.1: Resolve npm package ownership (from §12.34)
  - Acceptance: written decision in `agent-integration/pi/cockpit/PUBLISHING.md` naming the npm org, publish-key custodian, and release-automation flow. Decision recorded BEFORE publish workflow is set up.
  - Verify: `test -f agent-integration/pi/cockpit/PUBLISHING.md`
  - Files: `agent-integration/pi/cockpit/PUBLISHING.md`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.69 (Pi cockpit on npm — gating decision)

- [ ] Task 7.2: Configure `fulcrum-cockpit` package + publish workflow
  - Acceptance: `agent-integration/pi/cockpit/package.json` declares the resolved scope (Task 7.1), `publishConfig: {access: "public"}`, and a 2FA-required publish token. CI workflow at `.github/workflows/publish-cockpit.yml` uses `--provenance` attestation per security F10.
  - Verify: `pnpm publish --dry-run` from `agent-integration/pi/cockpit/` succeeds; `cat .github/workflows/publish-cockpit.yml | grep "provenance"` returns a match.
  - Files: `agent-integration/pi/cockpit/package.json`, `.github/workflows/publish-cockpit.yml`
  - Prerequisite gate: Gate 1; Task 7.1
  - Maps to AC: §11.69

### Phase 8: PR 17 — Per-host enhancements (Part 08 [v2b]-tagged rows) (~5h 23m budget)

Per `docs/brainstorms/2026-04-16-memory-architecture-v2/08-per-host-plugin-integration.md` §"Copy-File / Upgrade Manifest" rows tagged `[v2b]` (excluding Copilot which is PR 18).

- [ ] Task 8.1: Add Gemini `BeforeModel` / `AfterModel` / `PreCompress` hook entries
  - Acceptance: `agent-integration/gemini/hooks/hooks.json` adds three entries per Part 08 §H2 lines 132–138. `BeforeModel` no-op; `AfterModel` no-op; `PreCompress` invokes Fulcrum's PreCompact extractor (already in v2a) producing `pre_compact_extract` memories.
  - Verify: `node agent-integration/gemini/hooks/test-precompress.mjs` (a test harness lands with the change) — asserts a long-context Gemini session triggers ≥1 `pre_compact_extract` memory write.
  - Files: `agent-integration/gemini/hooks/hooks.json`, `agent-integration/gemini/hooks/test-precompress.mjs`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.61 (Gemini lifecycle hooks complete)

- [ ] Task 8.2: Switch Codex `invoke_team` to `approval_mode = "prompt"`
  - Acceptance: `agent-integration/codex/config.toml` `invoke_team` tool entry sets `approval_mode = "prompt"` per Part 08 §H3 step 2. Hook-based denial path remains as fallback for older Codex builds.
  - Verify: launch Codex with the updated config; calling `invoke_team` triggers Codex's native confirmation UI (manual one-time check, captured as a screenshot in `agent-integration/codex/docs/approval-mode.md`).
  - Files: `agent-integration/codex/config.toml`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.63 (Codex `invoke_team` prompt approval)

- [ ] Task 8.3: Build Claude Code `.claude-plugin/plugin.json` marketplace bundle
  - Acceptance: `agent-integration/claude/.claude-plugin/plugin.json` per Part 08 §H1 step 1 + §S4 line 89 wraps existing hooks + MCP manifest + skills symlink. Required fields: `name`, `description`, `version`. Validates against Claude's plugin schema (research doc lines 56–68).
  - Verify: `claude /plugin install ./agent-integration/claude/` succeeds (manual check); `node scripts/validate-claude-plugin.mjs agent-integration/claude/.claude-plugin/plugin.json` passes.
  - Files: `agent-integration/claude/.claude-plugin/plugin.json`, `scripts/validate-claude-plugin.mjs`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.60 (Claude Code plugin bundle)
  - Cites research: `docs/research/plugin-standards-per-agent-host.md` §"Claude Code" lines 47–68

- [ ] Task 8.4: Subscribe OpenCode `todo.updated` + add `session.compacted` graph write path
  - Acceptance: `agent-integration/opencode/plugins/fulcrum.ts` subscribes to `todo.updated` (mirror into Fulcrum `tasks` table); `session.compacted` events emit `pre_compact_extract` memories AND fire a `team_instantiated`-style graph reducer write when applicable per Part 02 event-bus taxonomy.
  - Verify: `pnpm --filter fulcrum-opencode-plugin vitest run src/tests/event-subscriptions.test.ts`
  - Files: `agent-integration/opencode/plugins/fulcrum.ts`, `agent-integration/opencode/plugins/tests/event-subscriptions.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.64 (OpenCode event subscriptions)

### Phase 9: PR 18 — Copilot integration (~2h)

**Mandatory skills:** Gate 5 (Copilot user request) sign-off **MUST** be attached to this PR's description; if Gate 5 is open, this entire phase is BLOCKED. `find-docs github-copilot` to verify current Copilot Chat MCP + Agent Mode + `copilot-instructions.md` integration paths against the version of GitHub Copilot at PR-open time. `agent-skills:api-and-interface-design` for each integration surface (3 paths). `superpowers-developing-for-claude-code:developing-claude-code-plugins` if the Copilot integration shares plugin-manifest patterns with the Claude marketplace bundle (PR 17).

GATED by Gate 5: at least one user request must be documented before this PR begins.

- [ ] Task 9.1: Create `agent-integration/copilot/.vscode/mcp.json`
  - Acceptance: file points to `fulcrum serve mcp --profile software_engineer` per Part 08 §H5 Path A line 192.
  - Verify: copy to a test repo's `.vscode/mcp.json`; open in VS Code; Copilot Chat tool list shows Fulcrum tools.
  - Files: `agent-integration/copilot/.vscode/mcp.json`
  - Prerequisite gate: Gate 1, Gate 5 (Copilot user request)
  - Maps to AC: §11.65 (Copilot Chat MCP)

- [ ] Task 9.2: Create `agent-integration/copilot/.github/copilot-instructions.md`
  - Acceptance: instructions file teaches Copilot to call `fulcrum action exec <name>` via Bash tool when in Agent Mode / cloud-agent. Mirrors guidance from existing skills under `agent-integration/skills/`.
  - Verify: open a repo with this file; trigger Copilot Agent Mode on a task that should call `recall_memory`; assert the agent shells `fulcrum action exec recall_memory ...` in its trace.
  - Files: `agent-integration/copilot/.github/copilot-instructions.md`
  - Prerequisite gate: Gate 1, Gate 5
  - Maps to AC: §11.66 (Copilot Agent Mode CLI-first)

- [ ] Task 9.3: Symlink shared skills library into Copilot integration
  - Acceptance: `agent-integration/copilot/.agents/skills/` symlinks to `agent-integration/skills/` (canonical tree from v2a §S1).
  - Verify: `readlink agent-integration/copilot/.agents/skills` resolves to `../../skills`.
  - Files: `agent-integration/copilot/.agents/skills` (symlink)
  - Prerequisite gate: Gate 1, Gate 5
  - Maps to AC: §11.67 (carry-forward — shared skills library deployed to all six hosts)

- [ ] Task 9.4: Author `agent-integration/copilot/README.md`
  - Acceptance: README documents (a) copy `.vscode/mcp.json` into your workspace; (b) copy `.github/copilot-instructions.md` into your repo; (c) `gh mcp install fulcrum` command if available. Per Part 08 §H5 step 4.
  - Verify: `test -f agent-integration/copilot/README.md && grep -q "gh mcp install" agent-integration/copilot/README.md`
  - Files: `agent-integration/copilot/README.md`
  - Prerequisite gate: Gate 1, Gate 5
  - Maps to AC: §11.65, §11.66

### Phase 10: PR 19 — Monitor graph endpoints + Graph dashboard tab (~1 week)

**Mandatory skills:** `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` for every visual change to the Dashboard Graph tab; smoke-test via DevTools MCP on `http://127.0.0.1:4721/dashboard/graph`. `agent-skills:security-and-hardening` for the Cypher allowlist (constraint #9 loopback enforcement + write-statement rejection + `LOAD CSV` rejection + filesystem-`CALL` rejection); red-team the allowlist with adversarial Cypher payloads. `find-docs Kuzu` for current Cypher subset support. `agent-skills:frontend-ui-engineering` for the force-directed graph rendering (the dashboard is user-facing UI, not just an API).

Cypher allowlist enforcement is the security gate.

- [ ] Task 10.1: Implement `GET /graph/query?cypher=` with allowlist
  - Acceptance: `packages/monitor/src/routes/graph-query.ts` parses the cypher param, runs it through a read-only allowlist (rejects `LOAD CSV`, `CREATE`, `MERGE`, `DELETE`, `SET`, filesystem-touching `CALL` subqueries). Loopback-binding invariant per critical constraint #9 + Part 02 §"Monitor dashboard" line 234. Cypher parsed with kuzu-native parser; allowlist applied to AST node types.
  - Verify: `pnpm --filter fulcrum-monitor vitest run src/routes/tests/graph-query-allowlist.test.ts` — submits 5 disallowed Cypher patterns; each returns 400; submits 5 allowed read patterns; each returns 200 with results.
  - Files: `packages/monitor/src/routes/graph-query.ts`, `packages/monitor/src/routes/tests/graph-query-allowlist.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.4
  - Maps to AC: §11.51 (monitor graph endpoints work)
  - Risk addressed: security F3 + F11 (loopback binding + allowlist)

- [ ] Task 10.2: Implement `GET /project-context?file=X` HTTP surface
  - Acceptance: `packages/monitor/src/routes/project-context.ts` mirrors PR 13 Task 4.2 `project_context` action over HTTP. Same response shape; same workspace-id filtering enforced.
  - Verify: `pnpm --filter fulcrum-monitor vitest run src/routes/tests/project-context.test.ts` — populates a project; asserts HTTP response equals action response.
  - Files: `packages/monitor/src/routes/project-context.ts`, `packages/monitor/src/routes/tests/project-context.test.ts`
  - Prerequisite gate: Gate 1; PR 13 Task 4.2
  - Maps to AC: §11.51

- [ ] Task 10.3: Implement `GET /a2a/cards/<role>` endpoint
  - Acceptance: `packages/monitor/src/routes/a2a-cards.ts` returns Google A2A `AgentCard` JSON derived from `agent_definitions` row at request time (not cached) per Part 02 §"A2A agent cards" lines 246–254. Same logic as `fulcrum action exec get_agent_card --role X`.
  - Verify: `pnpm --filter fulcrum-monitor vitest run src/routes/tests/a2a-cards.test.ts` — asserts response matches A2A spec for `software_engineer` role.
  - Files: `packages/monitor/src/routes/a2a-cards.ts`, `packages/monitor/src/routes/tests/a2a-cards.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.53 (A2A card stability)

- [ ] Task 10.4: Add Graph tab to dashboard
  - Acceptance: `packages/monitor/src/dashboard/graph-tab.tsx` renders force-directed view of current project's Kuzu graph filtered to node kinds + scope per Part 02 §"Monitor dashboard" line 232. Hits `/graph/neighborhood/<node-id>?depth=2` for visualization data.
  - Verify: open `http://127.0.0.1:4721/#graph` in headless browser via `pnpm --filter fulcrum-monitor playwright test`; assert >0 nodes rendered after seeding.
  - Files: `packages/monitor/src/dashboard/graph-tab.tsx`, `packages/monitor/src/routes/graph-neighborhood.ts`
  - Prerequisite gate: Gate 1; Task 10.1
  - Maps to AC: §11.51

- [ ] Task 10.5: Reframe `build_cos_context` as parameterized graph query
  - Acceptance: `packages/cli/src/actions/build-cos-context.ts` (or wherever the existing CoS context builder lives) executes a parameterized Cypher query through the graph allowlist instead of hand-joined SQL per Part 02 §"Chief-of-Staff context" lines 236–244. 5-min cache; invalidated on `task_updated` / `agent_run_started` / `handoff_dispatched` events.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/build-cos-context-graph.test.ts` — asserts cache invalidation on each of the three triggering events.
  - Files: `packages/cli/src/actions/build-cos-context.ts`, `packages/cli/src/tests/build-cos-context-graph.test.ts`
  - Prerequisite gate: Gate 1; Tasks 10.1 + PR 10 Task 1.4
  - Maps to AC: §11.52 (CoS context is graph query, not store)

### Phase 11: PR 20 — External sync + git reducers + A2A + analytics (~1 week)

Depends on PR 10 graph foundation.

- [ ] Task 11.1: Implement git reducer (post-commit hook + periodic walker)
  - Acceptance: `packages/memory/src/kuzu/reducers/git.ts` writes `git_commit` / `git_branch` / `git_pr` / `git_tag` nodes + `landed_in` / `on` / `includes` / `delivered_in` edges per Part 02 §"Git objects". Two paths: (a) post-commit hook calls `fulcrum action exec record_commit`; (b) Dreaming light phase periodic `git log` walker for backfill.
  - Verify: `pnpm --filter fulcrum-memory vitest run src/kuzu/reducers/tests/git-reducer.test.ts` — fires a fake commit event, asserts `git_commit` node + `landed_in` edge appear in Kuzu.
  - Files: `packages/memory/src/kuzu/reducers/git.ts`, `packages/cli/src/actions/record-commit.ts`, `packages/memory/src/kuzu/reducers/tests/git-reducer.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.5
  - Maps to AC: §11.48 (git PR → code chain navigable)

- [ ] Task 11.2: Implement external-sync reducer (webhook for Plane/GitHub; poll for Jira)
  - Acceptance: `packages/sync/src/external-ref-reducer.ts` writes `external_ref` nodes + `shadow_of` edges from `sync_states` / `sync_conflicts` rows. Plane + GitHub use webhook adapters (real-time); Jira uses 5-min poll cadence per architecture decision §12.27.
  - Verify: `pnpm --filter fulcrum-sync vitest run src/tests/external-ref-reducer.test.ts`
  - Files: `packages/sync/src/external-ref-reducer.ts`, `packages/sync/src/tests/external-ref-reducer.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.5
  - Maps to AC: §11.47 (external sync refs visible in `project_context`)

- [ ] Task 11.3: Implement agent-adapter reducer
  - Acceptance: `packages/worker/src/agent-adapter-reducer.ts` writes `agent_adapter` nodes on `registerAgentAdapter()` call + `executed_by` edges on `start_agent_run`. Adapter ID per architecture decision §12.28: `sha256({executor_uri}:{model}:{version})[:32]`.
  - Verify: `pnpm --filter fulcrum-worker vitest run src/tests/agent-adapter-reducer.test.ts`
  - Files: `packages/worker/src/agent-adapter-reducer.ts`, `packages/worker/src/tests/agent-adapter-reducer.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.5
  - Maps to AC: §11.49 (adapter telemetry)

- [ ] Task 11.4: Implement A2A `agent_card` derivation action
  - Acceptance: `packages/cli/src/actions/get-agent-card.ts` renders Google A2A AgentCard JSON from `agent_definitions` row at query time per Part 02 §"A2A agent cards". `list_agent_cards` action returns all cards.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/agent-card.test.ts`
  - Files: `packages/cli/src/actions/get-agent-card.ts`, `packages/cli/src/actions/list-agent-cards.ts`, `packages/cli/src/tests/agent-card.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.53 (A2A card stability)

- [ ] Task 11.5: Implement `get_analytics` read-only action
  - Acceptance: `packages/cli/src/actions/get-analytics.ts` accepts `{dimension: 'daily'|'cycle'|'project'|'agent'|'team', scope, from, to}` and returns rollup rows per Part 02 §"Analytics rollups" lines 302–310. Cold install returns empty; rollups produced only when `analytics-enabled` rule is toggled by operator.
  - Verify: `pnpm --filter fulcrum-cli vitest run src/tests/get-analytics.test.ts` — asserts cold install returns `[]`; populated install returns rollup rows.
  - Files: `packages/cli/src/actions/get-analytics.ts`, `packages/cli/src/tests/get-analytics.test.ts`
  - Prerequisite gate: Gate 1
  - Maps to AC: §11.57 (analytics reachable)

- [ ] Task 11.6: Verify prose ingestion covers in-repo markdown + configs (carries from v2a; full graph-edge surfacing is v2b)
  - Acceptance: `search_code(text: 'X', lang: ['md'])` surfaces `docs/brainstorms/*` content. `code_context(file: 'AGENTS.md')` returns the rules the project declares including memory edges from `mentions`. (Prose ingestion itself shipped in v2a PR 3; this task verifies cross-type graph edges work end-to-end with v2b graph.)
  - Verify: `pnpm --filter fulcrum-memory vitest run src/tests/prose-ingestion-graph.test.ts`
  - Files: `packages/memory/src/tests/prose-ingestion-graph.test.ts`
  - Prerequisite gate: Gate 1; PR 10 Task 1.4; PR 13 Task 4.1
  - Maps to AC: §11.50 (prose ingestion covers in-repo markdown + configs — graph-edge surfacing)

### Phase 12: PR 21 — Feature-flag removal + bake cleanup (~1 day)

**🛠️ Bootstrap mode: ON.** This is the only v2b bootstrap-risky PR. Removing `FULCRUM_MEMORY_V2` changes behavior on every flag-conditional branch; `mcp__fulcrum__*` calls mid-PR may hit a half-removed branch. Engineer uses external substitutes per §"Bootstrap Mode" for the duration of this PR. Capture entry-checkpoint snapshots before opening; run exit-checkpoint smoke tests before declaring v2b complete.

**Mandatory skills:** `agent-skills:deprecation-and-migration` checklist drives this entire PR. Pre-flight `Bash`: `grep -rn "FULCRUM_MEMORY_V2" packages/ agent-integration/ docs/` MUST return zero hits at end-of-PR. `agent-skills:code-review-and-quality` flag-removal review specifically: no orphaned legacy code branches; no dead conditionals; no still-flagged tests. The ≥2-week v2b bake window MUST be evidenced via three `mcp__fulcrum__get_workspace_status` snapshots (PR 20-merge-day + bake-day-7 + bake-day-14) attached to the PR description.

Lands AFTER v2b bake (≥2 weeks of all v2b PRs in production).

- [ ] Task 12.1: Remove `FULCRUM_MEMORY_V2` flag from all branches
  - Acceptance: `rg -n "FULCRUM_MEMORY_V2" packages/ agent-integration/` returns zero matches. Old code paths (flag-off behavior) deleted; v2b paths become the only path.
  - Verify: `rg -n "FULCRUM_MEMORY_V2" packages/ agent-integration/` returns zero results; full repo test suite passes (`pnpm test`).
  - Files: across `packages/memory/`, `packages/core/`, `packages/cli/` — wherever the flag is checked
  - Prerequisite gate: Gate 1; ALL prior v2b PRs (10–20) deployed AND baked ≥2 weeks
  - Maps to AC: none directly — cleanup PR

- [ ] Task 12.2: Drop dead pre-v2 code paths
  - Acceptance: any `if (!flag) { /* legacy path */ }` branches deleted; legacy tests removed; documentation updated.
  - Verify: `pnpm test` and `pnpm --filter fulcrum-memory test` pass; manual review of `packages/memory/src/recall.ts` git diff shows no orphan branches.
  - Files: same as Task 12.1
  - Prerequisite gate: Gate 1; Task 12.1
  - Maps to AC: none directly

## Per-PR Acceptance Gates

| PR | §11 ACs satisfied | Other notes |
|---|---|---|
| PR 10 — Full Kuzu DDL | §11.48, §11.49, §11.54, §11.55, §11.56, §11.58, §11.59 | Foundation; all subsequent v2b PRs depend on it |
| PR 11 — Dreaming light + REM + deep + procedural | §11.5, §11.14, §11.15, §11.16 | Gate 3 mandates 249-session sweep first; Dreaming fully v2b per scope-split update |
| PR 12 — Global pointer + scope:global + policy registry + list_activations | §11.29, §11.31, §11.42, §11.43 | Depends on PR 11 REM phase; absorbs §11.42 + §11.43 deferred from v2a per user decision |
| PR 13 — code_context + project_context | §11.20, §11.23, §11.40 (graduates from v2a degraded) | Depends on PR 10 graph foundation |
| PR 14 — Fulcrum eval + LongMemEval | §11.35 (REFRAMED per F7) | Gate 4 mandates Fulcrum-specific eval lands first |
| PR 15 — Context-type audit + WAL replay | §11.32, §11.33 | |
| PR 16 — Pi cockpit npm publish | §11.69 | Depends on §12.34 ownership decision (Task 7.1) |
| PR 17 — Per-host enhancements | §11.60, §11.61, §11.63, §11.64 | |
| PR 18 — Copilot integration | §11.65, §11.66 | Gate 5 mandates user request first |
| PR 19 — Monitor graph + Graph tab | §11.51, §11.52 | Depends on PR 10 |
| PR 20 — External sync + git + A2A + analytics | §11.47, §11.50, §11.53, §11.57 | Depends on PR 10 |
| PR 21 — Flag removal | none directly | Gates on full bake of PRs 10–20 |

## Risk Register (v2b-specific)

| Finding | Mitigation | Gate / task that catches it |
|---|---|---|
| Adversarial F1 — Kuzu scaffolding myth (was 4 days, realistic 2 weeks) | PR 10 estimated at 2 weeks with 8 explicit tasks (1.1–1.8) | Gate 1 (v2a bake — Kuzu base must work first); PR 10 Task 1.4 (full DDL test) |
| Adversarial F3 — Dreaming promotion-rate risk on code-agent workload | 249-session offline sweep with thresholds reworked if <5% promotion rate | Gate 3 (BLOCKS PR 11) |
| Adversarial F11 — Graph reducer subscription cost (event-bus throughput) | Batching + backpressure spec in PR 10 Task 1.6 (64 events/250ms; lag warning at 5s) | PR 10 Task 1.6 |
| Adversarial F14 — Reducer fail-silent silently corrupts Kuzu | Per-reducer try/catch + `reducer_error` log + nightly SQLite↔Kuzu divergence monitor | PR 10 Task 1.5, Task 1.7 |
| Product F2 — Identity conflict (memory-first title vs control-plane-first AGENTS.md) | User must decide before PR 10 begins; either update AGENTS.md or re-sequence v2b | Gate 2 (BLOCKS PR 10) — surfaced as Open Question #1 |
| Product F4 — Copilot at zero user request | Defer PR 18 entirely until at least one user requests it | Gate 5 (BLOCKS PR 18) |
| Product F7 — LongMemEval is warped for code-agent memory | Fulcrum-specific eval designed + seeded BEFORE LongMemEval harness; LongMemEval becomes secondary signal | Gate 4 (BLOCKS PR 14); PR 14 Task 5.1 lands before Task 5.2 |
| Moderate — Windows fork() cost 50ms per hook | Add a hook-shell-latency AC measurement on Windows runners (deferred — not in PR 10–21 scope; called out in handover §"Review findings still open" Moderate list) | Out of v2b scope; tracked separately |
| Moderate — Portable pathing breaks on renames | `fulcrum project relocate` (already in §11.26 v2a); v2b adds a `fulcrum project rename` for monorepo restructures (deferred enhancement; not in PR 10–21) | Tracked separately |

## Cross-plan handoff (input from v2a)

### Receive procedure (executed before v2b PR 10 begins)

Pair with v2a's "Handoff procedure" (`docs/plans/2026-04-16-memory-v2a-plan.md` §"Cross-plan handoff notes"). Both sides must complete; one-sided handoff is a defect.

1. **Recall handoff memory.** `mcp__fulcrum__recall_memory query='v2a v2b handoff'` must return all 10 numbered handoff items below. If <10, the v2a side did not complete step 3 of its handoff procedure — block on getting those memories written before starting any v2b PR.
2. **Verify Gate 1 evidence on disk.** Three workspace-status snapshots from v2a-merge-day + bake-day-7 + bake-day-14 must exist (see v2a handoff procedure step 2). `mcp__fulcrum__get_workspace_status` at handoff time must show zero blocked v2a runs and zero v2a rollbacks. If a v2a rollback occurred during the bake window, Gate 1 resets — bake clock starts over.
3. **Verify all 10 handoff items in code.** For each numbered item below: `Bash` test (`grep -r '<expected symbol>' packages/<expected pkg>/src/`) confirming the symbol exists. Block PR 10 if any item is missing — it means v2a shipped incomplete and v2b cannot inherit cleanly.
4. **Re-source-verify external libraries.** During the v2a bake, library versions may have moved. Re-run `find-docs Kuzu`, `find-docs sqlite-vec`, `find-docs xxhash-wasm`, `find-docs chokidar` against the versions then-pinned in `packages/memory/package.json` and `packages/cli/package.json`. Update v2b plan task notes if any API shifted.
5. **Spawn v2b task rows.** `mcp__fulcrum__create_task` for each v2b PR (12 PRs total: PRs 10–21) — should already be done by v2a handoff step 4; verify with `mcp__fulcrum__list_tasks status=queued`.
6. **Verify all five gates' status.** Gate 1 (v2a bake) should be GREEN before any v2b PR opens. Gates 2–5 are PR-specific; verify their pass criteria are documented in `docs/decisions/` or equivalent before the corresponding PR opens.
7. **Load v2b context bundle.** `agent-skills:context-engineering` to load: scope-split.md, this plan, v2a-final review (any P1+ residue), the cross-plan review, the document-review headless reviews, and the relevant chunks under `docs/brainstorms/2026-04-16-memory-architecture-v2/`. Done once per Phase boundary, not per task.

### Items v2b assumes v2a delivered — each item cites the v2a PR:

1. **Tier A algorithms** (temporal-decay, MMR, hybrid, events-WAL, walker, lock, intent, colbert-math, ignore-patterns, hash, git-files) at `packages/memory/src/scoring/`, `packages/memory/src/retrieval/`, `packages/memory/src/pci/`. Source: v2a PR 1 per `docs/brainstorms/2026-04-16-memory-v2-source-inventory.md` line 190.
2. **Kuzu base schema** with Memory + Entity + File + CodeChunk + Symbol nodes + `MENTIONS` / `ABOUT` / `imports` / `calls` / `defines` / `contained_in` rels. Source: v2a PR 7 per source inventory line 196. v2b extends from `packages/memory/src/kuzu/schema.ts` which today is at the v2a baseline (Memory + Entity only — File/CodeChunk/Symbol added in v2a PR 7).
3. **Sanitize-before-WAL invariant** with WAL at `{globalDataDir()}/db/wal/` and sha256-only redaction. Source: v2a PR 5 per source inventory line 194.
4. **`FULCRUM_MEMORY_V2=1` flag** turning v2 schema additions on (PR 21 removes after v2b bake). Source: v2a PR 1 per `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md` §10.
5. **Persisted session-scope storage** in central SQLite. Source: v2a per handover §"Outstanding architectural decisions" #8.
6. **RRF fusion in `packages/memory/src/scoring.ts`** (`rrfScore`, `rrfFuse`, `recallScore`). Source: pre-existing in `packages/memory/src/scoring.ts` (verified at lines 37–126); v2a PR 2 ports prior-art `searcher.ts` retrieval pipeline on top of it.
7. **`memories.kind` validator in `packages/memory/src/write.ts`** (CHECK constraint dropped, app-level validation). Source: v2a PR 1 per source inventory line 190.
8. **Global-only data invariant** ensured by `globalDataDir()` calls across all v2a writes. Source: critical constraint #1.
9. **Per-dir `fs.watch` PCI watcher** (prior-art style) at `packages/memory/src/pci/watcher.ts`. v2b's git-reducer (PR 20 Task 11.1) and external-sync reducer (PR 20 Task 11.2) integrate with this watcher; do not spawn a second. Source: v2a PR 4 per source inventory line 193.
10. **Context-type guard with NO DEFAULT** on `start_agent_run`. v2b PR 15 Task 6.1 audits remaining call sites for compliance. Source: v2a per Part 04 §3.1 + Part 05 §5.

## FULCRUM_MEMORY_V2 flag lifecycle

- **v2a ship → v2b bake start:** flag is ON in production. v2a paths use new schema; v2b PRs 10–20 add functionality behind the same flag.
- **v2b PRs 10–20 deployed → v2b bake start:** flag remains ON. All v2b code paths active.
- **v2b bake ≥2 weeks complete:** PR 21 runs.
- **PR 21 Task 12.1:** flag references removed from all branches in `packages/memory/`, `packages/core/`, `packages/cli/`, `agent-integration/`.
- **PR 21 Task 12.2:** legacy code paths (where flag-off behavior diverged) deleted. v2b paths become the only path.
- **Post-PR-21:** flag is gone; documentation updated; no rollback path to pre-v2 schema.

## Open questions (v2b-only — that planning cannot resolve without user input)

1. **Identity decision (Gate 2 — BLOCKS PR 10).** Title says memory-first; AGENTS.md says control-plane-first. User must pick one and document the decision before PR 10 begins. The current plan order assumes **title-wins-authority** (memory-first framing kept; AGENTS.md updated to match): Phase 1 (PR 10 Kuzu DDL) → Phase 2 (PR 11 Dreaming) → Phase 3 (PR 12 global pointer) → Phase 4 (PR 13 `code_context`/`project_context`) → Phase 5 (PR 14 Fulcrum-eval) → Phases 6–11. The control-plane graph lands first only because PRs 13/19/20 depend on it; everything else stays memory-prioritized.

   **Alternate ordering if AGENTS.md-wins-authority** (control-plane lands first; memory work follows): Phase 1 (PR 10 Kuzu DDL) → Phase 4 (PR 13 `code_context`/`project_context` consumes graph immediately) → Phase 10 (PR 19 monitor `/graph` endpoints) → Phase 11 (PR 20 git/external-sync/A2A reducers) → Phase 6 (PR 15 context-type audit + WAL replay) → Phase 2 (PR 11 Dreaming, gate-3-blocked) → Phase 3 (PR 12 global pointer, depends on PR 11) → Phase 5 (PR 14 Fulcrum-eval) → Phase 7 (PR 16 `embedded` backfill) → Phase 8 (PR 17 per-host enhancements) → Phase 9 (PR 18 Copilot, gate-5-blocked) → Phase 12 (PR 21 flag removal). Same 12 PRs, same 5 gates, dependency graph respected; the difference is which 4 PRs land first to validate the control-plane identity. Effort total unchanged (~6–8 weeks).

   Note: PR 10 is first in BOTH orderings because it is the Kuzu foundation that the control-plane PRs (13/19/20) depend on. The "AGENTS.md-wins" reshuffle moves the control-plane consumers (PRs 13/19/20) ahead of the memory consumers (PRs 11/12) — it does not change PR 10's first-slot position.

   Source: handover §"Review findings still open" — product F2; v2b review P0-2 mitigation.

2. **Cypher allowlist scope (PR 19 Task 10.1).** The Cypher allowlist rejects write statements + `LOAD CSV` + filesystem-touching `CALL` subqueries. Open question: should the allowlist also restrict subgraph traversal depth (e.g., max 3 hops) to bound query cost? Default plan says no depth limit; user input requested if monitor exposure risk warrants tightening. Source: §12.29; Part 02 §"Monitor dashboard" line 234.

3. **Copilot user-request capture mechanism (Gate 5 — BLOCKS PR 18).** What counts as "at least one user request"? Suggested formats: (a) GitHub issue with `copilot-integration` label; (b) recorded customer-success conversation; (c) feature-vote count threshold. User must pick the mechanism so engineering knows when Gate 5 has cleared. Source: handover §"Review findings still open" — product F4.
