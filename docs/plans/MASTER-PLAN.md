---
title: "Fulcrum Master Plan — living coordinator for all active + upcoming work"
type: master
status: living
date: 2026-04-18
supersedes: "2026-04-15 MASTER-PLAN (sprint-scoped; archived below)"
---

# Fulcrum Master Plan

> **For agentic + human workers.** This is a **living document**. It does not contain implementation detail — it **routes** you to the per-subsystem plan that does. Update it whenever a plan is added, a plan ships, a shared resource is reserved, or a cross-plan dependency is discovered. The bottom section preserves the 2026-04-15 sprint master plan for audit purposes.

---

## How to Use This Document

1. **Picking up work?** Jump to §Plan Registry, find a plan with status `active` or `draft`, open the linked plan doc. Never start work from the master plan alone.
2. **Starting a new plan?** Read §Coordination — Shared Resources first. Claim the next migration block, feature-flag prefix, and role slug **here** (in this master doc) before writing the new plan.
3. **Closing a plan?** Update §Plan Registry status to `completed` or `archived`, add a one-line outcome, and move it into §Completed & Archived Plans.
4. **Hit a cross-plan conflict?** Add it to §Cross-Plan Coordination Points. Do not resolve silently inside your plan.
5. **Trying to understand project state?** Read §Status Overview top-to-bottom. It's the TL;DR.

---

## Status Overview (2026-04-18)

**Active tracks (ordered by projected completion — earliest first):**
1. **Memory v3 — tiered L0/L1/L2 architecture** · PR 0 of 10 complete · ~3 weeks remaining · plan `2026-04-18-002-memory-tiered-architecture-plan.md`
2. **Indexer daemon refactor** · PRs 1–5 shipped per git log · likely closing · plan `2026-04-18-001-refactor-indexer-daemon-plan.md`
3. **Install TUI Dashboard** · active · progress unaudited · plan `2026-04-16-001-feat-install-tui-dashboard-plan.md`
4. **Worktrees v2 — PM-flow + orchestration** · draft, approval pending · 14 PRs / ~9 weeks · plan `2026-04-18-003-worktrees-v2-plan.md`

**Active-but-contested** (need user decision — see §Open Questions):
- **Memory v2a** (9 PRs) — superseded by v3? Or shipped and v3 is incremental?
- **Memory v2b** (12 PRs) — same question.
- **plan-architecture.md / plan-mcp.md / plan-plugins.md / plan-rag.md / plan-skills-agents.md** — Wave 0 complete per git log; Waves 1–3 ambiguous.

**Completed** (see §Completed & Archived Plans for outcomes):
- `2026-04-15-001-feat-fulcrum-install-to-value-plan.md`
- `2026-04-15-002-fix-monitor-reliability-and-test-gaps-plan.md`
- `2026-04-16-cli-first-action-platform-plan.md`

**Likely abandoned** (stub / no progress / unreferenced):
- `2026-04-16-plugin-install-operator-surfaces-plan.md` (55 lines, never fleshed out)

---

## Plan Registry

Canonical source of truth for every plan doc in this repo. One row per plan. Update this table in the same PR that creates/updates/closes a plan.

| Plan | Status | Subsystem | PRs | Dependencies | Owner | Target |
|---|---|---|---|---|---|---|
| `2026-04-15-001-feat-fulcrum-install-to-value-plan.md` | completed (7/7) | cross-cutting | 7 | — | shipped | — |
| `2026-04-15-002-fix-monitor-reliability-and-test-gaps-plan.md` | completed (6/6) | cross-cutting | 6 | — | shipped | — |
| `2026-04-16-001-feat-install-tui-dashboard-plan.md` | active | TUI, monitor, MCP | 10 phases | install-to-value (done) | TBC | TBC |
| `2026-04-16-cli-first-action-platform-plan.md` | completed | CLI, MCP | 6 | — | shipped | — |
| `2026-04-16-memory-v2a-plan.md` | **needs triage** | memory | 9 | — | — | see §Open Questions #1 |
| `2026-04-16-memory-v2b-plan.md` | **needs triage** | memory | 12 | v2a | — | see §Open Questions #1 |
| `2026-04-16-plugin-install-operator-surfaces-plan.md` | likely abandoned | CLI plugins | 0 (stub) | — | — | see §Open Questions #3 |
| `2026-04-18-001-refactor-indexer-daemon-plan.md` | likely done | memory/indexer | 5 shipped | — | — | see §Open Questions #2 |
| `2026-04-18-002-memory-tiered-architecture-plan.md` | active (PR 0 done) | memory | 10 | — | — | ~3 wks |
| `2026-04-18-003-worktrees-v2-plan.md` | draft (awaiting approval) | worktrees | 14 | memory v3 rule-engine primitives (light) | — | ~9 wks after approval |
| `plan-architecture.md` | **needs triage** | cross-cutting | 9 steps | — | — | see §Open Questions #4 |
| `plan-mcp.md` | **needs triage** | mcp | 9 steps | cli-first-action (done) | — | see §Open Questions #4 |
| `plan-plugins.md` | **needs triage** | cli | 7 steps | cli-first-action (done), mcp | — | see §Open Questions #4 |
| `plan-rag.md` | **needs triage** | memory | 8 steps | — | — | see §Open Questions #4 |
| `plan-skills-agents.md` | **needs triage** | core, agent-integration | 10 steps | cli-first-action (done) | — | see §Open Questions #4 |
| `MASTER-PLAN.md` | living | this doc | — | — | — | — |

**Not plans (artifacts):**
- `2026-04-16-memory-v2a-plan-review.md`, `2026-04-16-memory-v2b-plan-review.md`, `2026-04-16-memory-v2-cross-plan-review.md` — document-review outputs.
- `2026-04-18-002-memory-tiered-architecture-progress.md` — append-only progress ledger for memory v3.
- `2026-04-18-002-memory-tiered-architecture-prompt.md` — reusable resume prompt for memory v3.

**Plan status values:**
- `active` — PRs shipping; commits landing against this plan.
- `draft` — plan written, approval pending; no PRs opened yet.
- `partial` — some units shipped, remainder descoped or superseded; **must include a shipped-vs-plan diff listing per-unit commit SHAs or `descoped` markers** so downstream plans can check assumed state.
- `completed` — all units shipped; shipped-vs-plan diff on file.
- `superseded` — a later plan replaces this one; **must name the successor plan ID** in the registry row.
- `archived` — reference-only; no further work; shipped-vs-plan diff required before move.
- `needs triage` — status unknown; a §Open Questions entry covers the decision.
- `likely abandoned` — draft with no commits for >14 days; candidate for archive pending owner decision.

---

## Coordination — Shared Resources

**Every new plan claims its resources here** before writing DDL / code. Never pick a migration number or flag prefix without updating this section in the same change.

### Migration Number Registry

SQLite `schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT)`. Names become canonical; gaps are OK.

| Block | Owner | Scope |
|---|---|---|
| `m001..m052` | core | Consolidated into `applySchema()`; legacy names recorded via `recordLegacyMigrationNames()`. **Frozen.** |
| `006_teams` | packages/teams | `runMigration006Teams`, `runMigration006TeamsHeartbeat` |
| `007_workflows` | packages/workflows | `runMigration007Workflows` |
| `m041` | plan-skills-agents | system_prompt seed for core roles |
| `m042` | plan-skills-agents | `UNIQUE(workspace_id, role)` |
| `m043` | plan-rag | `memories_fts` tokenizer upgrade |
| `m050`, `m051` | install-to-value | `hook_events` table, `memories.source` field |
| `m044..m049`, `m053..m099` | **reserved, unclaimed** | Pick from here for any small core-schema change |
| `101..104` | memory v3 | `runMigration101MemoryV3Lifecycle`, `102_source_index`, `103_cutover`, `104_drop_canonical_text` |
| `105..199` | **reserved for memory v3.x follow-ups** | Future memory subsystem work |
| `201..213` | worktrees v2 | `runMigration201..213` — per §Migration Mechanics in worktrees-v2 plan |
| `214..299` | **reserved for worktrees v3+ follow-ups** | Future worktrees work |
| `300+` | **unclaimed** | Next subsystem grabs 301, 401, 501… (blocks of 100) |

**Claiming rules (strict):**
1. Each new subsystem takes the next unclaimed hundred block (`N01..N99`).
2. **Overflow forbids dipping into the follow-up reserve.** If a subsystem exceeds its declared cap mid-flight, it jumps to the next unclaimed hundred and documents the split here (e.g. "worktrees v2 = `201..213` + `301..305`"). Never consume a block reserved for a subsystem's future follow-ups — that range stays available for the owner subsystem to evolve into.
3. **Claim row BEFORE writing DDL.** Opening a PR with a new `runMigrationNNN*` function requires a prior (or simultaneous) MASTER-PLAN.md edit reserving the number. CI enforces this — `packages/core/` includes a check that scans branches for duplicate migration names.
4. **MASTER-PLAN.md merges are serialized.** No two PRs may merge MASTER-PLAN.md edits concurrently. This prevents two agents from racing on "next hundred" or "next unclaimed number within a block." Rebase and re-pick if your reservation was taken.

### Feature Flag Registry

All user-visible flags live under the `FULCRUM_` prefix.

| Flag | Owner | Default | Lifecycle |
|---|---|---|---|
| `FULCRUM_NO_MONITOR` | install-to-value | unset | shipped |
| `FULCRUM_MONITOR_PORT` | install-to-value | `4721` | shipped |
| `FULCRUM_MONITOR_TOKEN` | TUI dashboard | unset | active |
| `FULCRUM_ALERT_WEBHOOK` | TUI dashboard | unset | active |
| `FULCRUM_SETUP_NO_GATE` | install-to-value | unset | shipped |
| `FULCRUM_CURATOR_BACKEND` | memory v3 | auto-detect | shipped (PR 3) |
| `FULCRUM_CURATOR_MODEL` | memory v3 | `gpt-5-mini` | shipped (PR 3) |
| `FULCRUM_CURATOR_REASONING` | memory v3 | `minimal` | shipped (PR 3) |
| `FULCRUM_CURATOR_MODEL_{EXTRACTION\|CONSOLIDATION\|SYNTHESIS}` | memory v3 | per-task | shipped (PR 3) |
| `FULCRUM_MEMORY_V3` | memory v3 | on (since PR 5) | shipped; removed PR 9 |
| `FULCRUM_MEMORY_CURATE_AUTO` | memory v3 | off | shipped (PR 8.1) |
| `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE` | memory v3 | unset | shipped (PR 8.2) |
| `FULCRUM_WORKTREES_V2_FOUNDATIONS` | worktrees v2 | off | draft; per-PR subflags TBD |
| `FULCRUM_WORKTREES_V2_<FEATURE>` | worktrees v2 | off | draft; flipped on in PR 14 |
| `FULCRUM_MERGE_BATCHING`, `FULCRUM_MERGE_BATCH_SIZE`, `FULCRUM_MERGE_CANDIDATE_GATE_DISABLED` | worktrees v2 PR 8 | off/1/unset | draft |
| `FULCRUM_REMOTE_PR_HOST`, `GITHUB_TOKEN` | worktrees v2 PR 9 | unset | draft |
| `FULCRUM_WORKTREE_EVENT_RETENTION_DAYS` | worktrees v2 PR 10 | `90` | draft |

**Rule:** Add flags here in the plan that introduces them. Retire flags here when the plan's cutover PR removes them.

### Agent Role Registry

| Role | Status | Source plan | Capabilities summary |
|---|---|---|---|
| `chief_of_staff` | shipped (L1 orchestration) | plan-skills-agents | Orchestration only; only role allowed to invoke teams. |
| `integration_worker` | shipped | plan-skills-agents | Only role allowed to process merge queue. |
| `software_engineer`, `test_engineer`, `reviewer`, ... | shipped (24 canonical) | plan-skills-agents | Implementation roles; forbidden from invoking teams. |
| `curator` | proposed | memory v3 PR 3 | L0→L1 extraction, consolidation, synthesis via subprocess-backed LLM. |
| `lead_engineer` | proposed | worktrees v2 PR 7 | Allocate child worktrees under its own parent (stacked-worktree pattern). |

**Rule:** Any new role must (1) appear here, (2) be defined via `create_agent_definition` (or the shipping equivalent), (3) list capabilities the policy engine can key on.

### Schema / Table Name Registry (v3+)

New tables introduced by active/draft plans — listed so a future plan doesn't collide on names.

| Table | Owner | Introduced in |
|---|---|---|
| `l0_sources` | memory v3 | PR 0 unit 0.2 (shipped) |
| `l1_pages` (view) | memory v3 | PR 0 unit 0.2 (shipped) |
| `transition_validators`, `role_transitions`, `field_permissions`, `review_rules` | worktrees v2 | PRs 2–3 (draft) |
| `task_dependencies`, `iterations`, `intake_items` | worktrees v2 | PR 4 (draft) |
| `rules`, `rule_actions`, `rule_runs` | worktrees v2 | PR 5 (draft) |
| `inbound_webhooks`, `script_action_registry` | worktrees v2 | PR 6 (draft) |
| `worktree_merge_batches`, `worktree_events`, `worktree_undo_log`, `pull_requests`, `batch_handoffs`, `task_fanout_children`, `file_claims`, `webhook_subscriptions`, `api_tokens`, `label_scopes`, `label_scope_values`, `task_labels` | worktrees v2 | PRs 1, 8–13 (draft) |

### MCP Tool Namespace Registry

All MCP tools live under `mcp__fulcrum__`. Total **24** tools currently shipped (see `agent-integration/claude/CLAUDE.md` — auto-generated from `packages/cli/src/mcp-tools.ts`).

Proposed additions (unshipped):

| Tool | Proposed by | Scope |
|---|---|---|
| `inspect_memory`, `get_memory_sources`, `read_raw_source`, `trace_claim`, `mark_memory_wrong`, `reindex_memory` | memory v3 | §Operator + agent inspection paths in v3 plan |
| (worktrees v2 tools — TBC per PR) | worktrees v2 | See plan §AD-13: GraphQL + MCP parity |

**Rule:** Add proposed tool names here before the introducing PR lands; otherwise hidden collisions are possible when two plans draft in parallel.

**CLAUDE.md regeneration guard.** `agent-integration/claude/CLAUDE.md` is auto-generated from `TOOL_SCHEMAS` in `packages/cli/src/mcp-tools.ts` via `pnpm gen:claude-md`. Any PR adding/removing an MCP tool must:
1. Run `pnpm gen:claude-md` as the LAST commit before merge.
2. Rebase onto `main` after any other MCP-tool-touching PR lands (to pick up the correct tool count).
3. CI enforces: `pnpm gen:claude-md && git diff --exit-code` must pass on every PR touching `packages/cli/src/mcp-tools.ts`.

Without this guard, two concurrent MCP-tool PRs will both regenerate the tool count to different values (23→24 vs 23→25) and silently merge with the wrong count in the file humans + agents load at session start.

---

## Skill Arsenal — Which Tool For Which Moment

This section is the canonical skill-to-moment mapping for every active track. Individual plans may add track-specific skill callouts at their unit level, but the moments below apply project-wide. **Invoke by need, not by habit** — listing skills isn't the same as using them.

### Always-on (every active PR, regardless of track)

| Skill | When / why |
|---|---|
| `agent-skills:context-engineering` | Session start, before loading files. Keeps context lean. |
| `agent-skills:incremental-implementation` | Every PR; thin vertical slices; ≤500 diff lines. |
| `agent-skills:test-driven-development` | Every behavioural change. Failing test first. |
| `agent-skills:code-review-and-quality` | Before requesting human review. 5-axis self-check. |
| `andrej-karpathy-skills:karpathy-guidelines` | Every implementation decision. Surgical, no over-abstraction. |
| `compound-engineering:git-commit` | Every commit message. |
| `compound-engineering:ce-pr-description` | Every PR description. |
| `episodic-memory:remembering-conversations` | Before starting any new PR — recover prior-session lessons. |
| `agent-skills:using-agent-skills` | Session start; skill discovery. |

### Pre-work (before the first PR of a plan)

| Skill | When / why |
|---|---|
| `agent-skills:spec-driven-development` | New feature without a spec → write one first. |
| `agent-skills:planning-and-task-breakdown` | Break a large spec into verifiable units. |
| `compound-engineering:ce-plan` / `ce-brainstorm` / `idea-refine` | Pre-spec: explore the shape of the problem. |
| `compound-engineering:research:best-practices-researcher` | Competitive survey, pattern extraction (used for worktrees v2). |
| `compound-engineering:research:framework-docs-researcher` / `find-docs` | Verify library/API baseline. |
| `compound-engineering:research:git-history-analyzer` | Archaeology: why does this code exist? |
| `compound-engineering:research:learnings-researcher` | Check `docs/solutions/` for relevant past learnings. |
| `compound-engineering:document-review` (+ sub-personas) | After plan doc written; adversarial + coherence + feasibility + scope-guardian + security-lens. |
| `agent-skills:source-driven-development` | Every library decision grounded in current docs. |

### In-PR implementation

| Skill | When / why |
|---|---|
| `agent-skills:api-and-interface-design` | Any new public API, module boundary, or DDL contract. |
| `agent-skills:security-and-hardening` | Touches untrusted input, auth, data storage, external integrations. |
| `agent-skills:performance-optimization` | Hot paths, batch pipelines, async I/O budgets, query tuning. |
| `compound-engineering:agent-native-architecture` | Any agent-facing surface (CLI / MCP / rule engine / MCP tools). |
| `agent-skills:frontend-ui-engineering` | Any user-facing UI (monitor, TUI, dashboards). |
| `compound-engineering:frontend-design` | Visual design decisions; detect + respect existing design system. |
| `agent-skills:debugging-and-error-recovery` / `compound-engineering:ce-debug` | Stuck, failing test, unexpected state. |
| `codex:rescue` | Claude stuck after root-cause attempt; need a second opinion + independent diagnosis. |
| `compound-engineering:ce-work` | Execute a well-scoped feature end-to-end. |

### Schema / migrations / data-layer

| Skill | When / why |
|---|---|
| `compound-engineering:review:data-integrity-guardian` | New migration or data-mutating SQL. Gates merge. |
| `compound-engineering:review:data-migration-expert` | Backfill / column rename / enum conversion / schema shape change. |
| `compound-engineering:review:schema-drift-detector` | Any PR that touches `packages/core/src/db/schema.ts` or extension-package `schema.ts`. |

### Pre-merge review (stacks with cross-cutting)

| Skill | When / why |
|---|---|
| `compound-engineering:ce-review` | Diff ≥50 LOC. Runs a persona panel. |
| `compound-engineering:review:correctness-reviewer` | Always-on pre-merge. |
| `compound-engineering:review:maintainability-reviewer` | Always-on; catches premature abstraction + dead code. |
| `compound-engineering:review:testing-reviewer` | Always-on; coverage + assertion strength. |
| `compound-engineering:review:project-standards-reviewer` | Always-on; audits CLAUDE.md / AGENTS.md conformance. |
| `compound-engineering:review:adversarial-reviewer` | Diff ≥50 LOC **or** touches auth / payments / data mutations / external APIs. |
| `compound-engineering:review:performance-reviewer` | Touches query / loop / caching / I/O-intensive paths. |
| `compound-engineering:review:security-reviewer` | Touches auth middleware / public endpoints / user input / permissions. |
| `compound-engineering:review:api-contract-reviewer` | Changes API routes, request/response types, or exported type signatures. |
| `compound-engineering:review:reliability-reviewer` | Retries, timeouts, background jobs, health checks, async handlers. |
| `compound-engineering:review:cli-readiness-reviewer` | Touches CLI command definitions or handlers. |
| `compound-engineering:review:kieran-typescript-reviewer` | TS changes — strict standards pass. |
| `compound-engineering:review:previous-comments-reviewer` | PR has existing review threads. |

### Shipping + docs

| Skill | When / why |
|---|---|
| `compound-engineering:ce-demo-reel` | UI / CLI change that benefits from a visual proof in the PR body. |
| `agent-skills:shipping-and-launch` / `agent-skills:ship` | Pre-launch checklist; monitoring; rollback plan. |
| `compound-engineering:review:deployment-verification-agent` | Production-data-touching PR; produces Go/No-Go checklist + SQL verify queries. |
| `agent-skills:documentation-and-adrs` | Any architectural decision, any public API change, any ADR-worthy tradeoff. |
| `elements-of-style:writing-clearly-and-concisely` | Every human-read prose (ADRs, PR bodies, plan docs, commit messages). |
| `compound-engineering:onboarding` | ONBOARDING.md updates; agent-orientation docs. |
| `compound-engineering:ce-compound` | After solving a non-trivial bug, capture the lesson. |

### Per-track load-bearing callouts

**Memory v3** (`2026-04-18-002-memory-tiered-architecture-plan.md`)
- **PR 3 — curator pipeline:** `codex:gpt-5-4-prompting` (load-bearing — composes every curator prompt), `codex:codex-cli-runtime` (subprocess contract), `codex:codex-result-handling` (JSONL event stream parsing), `compound-engineering:review:adversarial-reviewer` (untrusted L0 input), `agent-skills:security-auditor` (injection surface).
- **PR 4 — L2 reshape:** `agent-skills:performance-optimization`, `find-docs` on `@xenova/transformers` batch API.
- **PR 5 — retrieval cutover:** `compound-engineering:ce-optimize` (tune RRF weights empirically against eval corpus), `agent-skills:test-engineer` (subagent — eval corpus design), `compound-engineering:review:performance-reviewer`.
- **PR 6 — data migration:** `agent-skills:deprecation-and-migration` (load-bearing), `compound-engineering:review:data-migration-expert`, `compound-engineering:ce-debug` (first-run surprises), `agent-skills:security-auditor` (rollback chain).
- **PR 7 — lifecycle:** `agent-skills:performance-optimization` (decay pass budget), `compound-engineering:ce-optimize` (λ decay tuning).
- **PR 8 — observability:** `agent-skills:ci-cd-and-automation` (eval gate in CI), `compound-engineering:ce-demo-reel`, `compound-engineering:onboarding`.

**Worktrees v2** (`2026-04-18-003-worktrees-v2-plan.md`)
- **PR 2 — validators:** `agent-skills:api-and-interface-design` (public validator surface), `find-docs` on `ajv` / `zod` / `typebox` before library choice.
- **PR 3 — authz matrix:** `agent-skills:security-and-hardening`, `compound-engineering:review:security-reviewer` (role-gate correctness).
- **PR 5 — rule engine:** `compound-engineering:agent-native-architecture` (load-bearing), `compound-engineering:review:adversarial-reviewer` (rule-as-footgun risk), `compound-engineering:review:performance-reviewer` (rule evaluator hot path).
- **PR 6 — script actions + webhooks:** `agent-skills:security-and-hardening` (HMAC + token storage + replay defense), `agent-skills:security-auditor` (subagent), `compound-engineering:review:security-reviewer`.
- **PR 7 — stacked worktrees:** `agent-skills:debugging-and-error-recovery` (cascade semantics), `Architecture Reviewer` (subagent).
- **PR 8 — batched merge queue:** `agent-skills:performance-optimization`, `compound-engineering:ce-optimize` (bisection strategy tuning).
- **PR 9 — remote PR sync:** `agent-skills:security-and-hardening` (token handling), `find-docs` on `@octokit/rest`, `agent-skills:security-auditor`.
- **PR 10 — events + undo:** `agent-skills:deprecation-and-migration` (undo reverser registry), `compound-engineering:review:reliability-reviewer` (replay invariants).
- **PR 11 — batch handoffs + lanes:** `compound-engineering:review:performance-reviewer` (file-claim contention).
- **PR 12 — SSE + UI:** `agent-skills:frontend-ui-engineering`, `compound-engineering:frontend-design`, `compound-engineering:ce-demo-reel`.
- **PR 13 — GraphQL + HMAC webhooks:** `agent-skills:api-and-interface-design`, `agent-skills:security-and-hardening`, `compound-engineering:review:api-contract-reviewer`, `find-docs` on GraphQL server choice.
- **PR 14 — cutover:** `compound-engineering:review:data-migration-expert`, `compound-engineering:review:deployment-verification-agent`, `compound-engineering:onboarding`.

**Install TUI Dashboard** (`2026-04-16-001-feat-install-tui-dashboard-plan.md`)
- All phases: `agent-skills:frontend-ui-engineering`, `compound-engineering:frontend-design`, `compound-engineering:ce-demo-reel` (recording the dashboard in motion).

**Domain-plan cleanup track** (see §Open Questions #4)
- Gap-by-gap audit: `compound-engineering:research:git-history-analyzer` (link gap IDs to shipped commits), `compound-engineering:research:repo-research-analyst`.

---

## Active Track Map

Four tracks run in parallel. Each track has an explicit **entry point** (first PR of its plan) and **exit criteria** (when the plan is marked `completed` in §Plan Registry).

### Track 1 — Memory v3

- Plan: `2026-04-18-002-memory-tiered-architecture-plan.md`
- Resume prompt: `2026-04-18-002-memory-tiered-architecture-prompt.md`
- Progress ledger: `2026-04-18-002-memory-tiered-architecture-progress.md`
- **Entry:** PR 1 unit 1.1 — `l0/ingest.ts` + `ingestRawSource`, wiring `runMigration101/102` at DB init.
- **Exit:** PR 9 cutover done — `FULCRUM_MEMORY_V3` flag removed, v2a column `memories.canonical_text` dropped, `docs/architecture/memory-v3.md` shipped.
- Current blocker: **none** — PR 0 merged and pushed. Ready for PR 1 on user approval.

### Track 2 — Worktrees v2

- Plan: `2026-04-18-003-worktrees-v2-plan.md`
- **Entry:** PR 1 unit 1.1 — `runMigration201` (foundations).
- **Exit:** PR 14 cutover — flags flipped, legacy `processMergeQueue` removed.
- Current blocker: **approval checklist §Approval Checklist in the plan** — 7 user decisions required before PR 1.

### Track 3 — Install TUI Dashboard

- Plan: `2026-04-16-001-feat-install-tui-dashboard-plan.md`
- **Entry:** next unaudited unit — needs progress audit against git log.
- **Exit:** defined in the plan.
- Current blocker: **status audit needed** — see §Open Questions #5.

### Track 4 — Domain-plan cleanup

- Plans: `plan-architecture.md`, `plan-mcp.md`, `plan-plugins.md`, `plan-rag.md`, `plan-skills-agents.md`.
- **Entry:** one-shot status audit per plan (grep latest commits for `GAP-*` gap IDs; mark each step shipped / open / deferred).
- **Exit:** each plan is either (a) fully shipped → move to §Completed, or (b) remaining scope re-packaged into a new dated plan.
- Current blocker: **§Open Questions #4** — user decides whether to audit + close, or retire the domain-plan format and let the dated feature plans carry remaining work.

### Indexer Daemon — Track 2.5 (tidy + close)

- Plan: `2026-04-18-001-refactor-indexer-daemon-plan.md`.
- PRs 1–5 appear shipped per `feat(indexer):` / `feat(pci):` commit prefixes (see git log).
- **Action:** user confirmation + one PR to archive the plan with outcomes.

---

## Cross-Plan Coordination Points

Points where two plans touch the same surface. When a plan is about to modify these surfaces, check here first.

1. **`schema_migrations` ledger.** Memory v3 uses `101..104`; worktrees v2 uses `201..213`. No overlap today, but any new plan must claim its block in the §Migration Number Registry above **before** writing DDL.
2. **Agent roles + policy engine.** Memory v3 adds `curator`; worktrees v2 adds `lead_engineer`. Both need rows in `agent_definitions` + policy rules. Policy rule IDs namespaced by role slug avoid conflict.
3. **Event stream.** `packages/core/src/event-bus.ts` (`FulcrumEventBus`) already exists as the canonical in-process pub-sub — it emits via `emitEvent()` in `packages/core/src/events.ts:32` and has a typed `EventType` union in `packages/core/src/types.ts:77-89` covering `worktree_allocated`, `merge_queued`, `merge_started`, `merge_completed`, `review_created`, `artifact_written`, etc. **Plans MUST reuse this bus; do not fork.** Memory v3 adds `l0.ingested`, `l1.page_written`, `curator.run_completed` to the existing `EventType` union. Worktrees v2 adds `fulcrum.merge_candidate` and rule-engine triggers likewise. No new per-subsystem events module is permitted.
4. **Rule engine (worktrees v2 PR 5) cross-subsystem triggers.** The rule engine dispatcher subscribes directly to `FulcrumEventBus`, giving it visibility into every `EventType` namespace. To prevent privilege amplification (e.g. a worktree-scoped rule firing on every `l0.ingested`), rules declare an event namespace in their trigger spec. Subscriptions to `fulcrum.l0.*` / `fulcrum.l1.*` / `fulcrum.curator.*` require `chief_of_staff` authorship (see §Open Questions #6 resolution). Worktree-local subscriptions (`fulcrum.worktree.*`, `fulcrum.task.*`) follow the rule-authorship gate in worktrees v2 §Critical Constraints.
5. **MCP tool surface.** Both plans propose new MCP tools (memory v3: inspect_memory, trace_claim, …; worktrees v2 may expose rule/intake/validator primitives). Must stay under `mcp__fulcrum__` prefix and register in `packages/cli/src/mcp-tools.ts` — this regenerates the counter in `agent-integration/claude/CLAUDE.md`.
6. **CLAUDE.md / AGENTS.md memory + worktrees sections.** Both plans add orientation sections to these files. Memory v3's "Memory Tiers (v3 draft)" shipped in commit `368f9eb`. Worktrees v2's equivalent will land in PR 14 cutover (plan unit 14.5).

---

## Definition of "Project Complete" (as of 2026-04-18)

The Fulcrum roadmap as currently known closes when **all seven conditions** hold:

1. Memory v3 plan status = `completed` (all 10 PRs shipped; `FULCRUM_MEMORY_V3` flag removed; shipped-vs-plan diff on file).
2. Worktrees v2 plan status = `completed` (all 14 PRs shipped; legacy `processMergeQueue` removed; shipped-vs-plan diff on file).
3. Install TUI Dashboard plan status = `completed` **or** formally descoped (with a "what shipped / what didn't" note).
4. All domain plans (architecture, mcp, plugins, rag, skills-agents) either `completed` or retired + remaining scope re-packaged into dated feature plans (each with a shipped-vs-plan diff).
5. Indexer daemon refactor plan archived with shipped-PR outcomes documented (shipped-vs-plan diff required).
6. Every Open Question is either closed (linked to a commit or ADR that resolves it) or explicitly reclassified as "future scope beyond v1 roadmap" with a new plan created. Unresolved questions may NOT be moved to a separate doc to satisfy this condition — the criterion is resolution, not absence.
7. No plan in `partial`, `superseded`, or `archived` status has undocumented schema assumptions consumed by an `active` plan. (Prevents memory v2a/v2b type silent dependencies from corrupting downstream cutovers.)

**New work beyond this set creates a new plan** and updates §Plan Registry + §Active Track Map.

**Shipped-vs-plan diff requirement.** Before a plan moves to §Completed & Archived Plans, its author produces a short markdown checklist — one row per unit in the plan doc — linking each unit to a commit SHA **or** marking it `descoped` with rationale. The checklist lives inline in the plan doc's closing block. This prevents phantom-dependency failures (e.g. memory v3 PR 6 tripping over a v2a column it assumed was dropped).

---

## Open Questions (user decisions required — unblocks Plan Registry rows)

Questions are triaged by **failure mode**: *silent-corrupt* (ships and breaks downstream invisibly) > *loud-block* (work halts with a clear error) > *cosmetic* (documentation noise only). Silent-corrupt questions must be resolved BEFORE the first affected PR starts.

### Silent-corrupt (must resolve before the listed PR)

6. **Event-bus factoring.** ✅ **RESOLVED in §Cross-Plan Coordination Points #3 + #4 above**: use existing `packages/core/src/event-bus.ts` (`FulcrumEventBus`); memory v3 and worktrees v2 both extend the existing `EventType` union; rule-engine subscriptions to memory namespaces require `chief_of_staff` authorship. **No new per-subsystem events module permitted.** Decision date: 2026-04-18.
1. **Memory v2a / v2b status.** Git log shows `fix(memory):` commits but no `feat(memory): v2a/v2b PR N` prefixes. Critical because memory v3 PR 6 (cutover) assumes v2a's `memories.canonical_text` column exists to drop — if v2a only partially shipped, PR 6 tries to drop a column that doesn't exist on some installs. **Decision needed BEFORE memory v3 PR 6 starts:** mark both `completed`, `partial` (with documented shipped-vs-plan diff listing which units shipped and which downstream plans depend on them), `superseded` by v3, or `retired`. A `partial` classification requires the shipped-vs-plan diff before memory v3 PR 6 proceeds.
2. **Indexer daemon plan.** Commits `5d91ae1..89dfc7c` land `feat(indexer): PR 1..5`. Plan doc says 6 units. Critical because memory v3 PR 7 (lifecycle decay) may depend on daemon-emitted `last_accessed_at` updates. **Decision needed BEFORE memory v3 PR 7:** confirm completion + ship shipped-vs-plan diff, or name PR 6's scope and reopen.

### Loud-block (will halt the affected PR with a clear error)

5. **Install TUI Dashboard progress.** 663 lines, 10 phases; resume point unclear. **Decision needed:** audit phases against current code and mark a clear resume point, or explicitly pause.
9. **Rule-engine YAML format (worktrees v2 PR 5).** GitHub Actions style vs Jira Automation style. PR 5 loader cannot be written before this is picked. **Decision needed BEFORE worktrees v2 PR 5a opens.**
10. **Schema validator library (worktrees v2 PR 2).** `ajv` vs `zod` vs `typebox` vs hand-rolled. Affects column shape of `artifact_contracts.content_contract`. **Decision needed BEFORE worktrees v2 PR 2 opens.**
11. **GraphQL server library (worktrees v2 PR 13).** `graphql-yoga` vs `apollo-server` vs `mercurius`. If PR 13 is deferred per scope guidance (see worktrees v2 plan), this question is also deferred. **Decision needed IF worktrees v2 PR 13 is kept in v2 scope.**

### Cosmetic (doesn't block work; resolve when convenient)

3. **`2026-04-16-plugin-install-operator-surfaces-plan.md`.** 55-line stub, unreferenced. **Decision:** archive as abandoned, or surface a single owner + complete.
4. **Domain-plan format (plan-architecture/-mcp/-plugins/-rag/-skills-agents).** **Decision:** (a) gap-by-gap audit per plan, (b) retire the `plan-<domain>.md` format entirely and fold residual gaps into dated feature plans, or (c) keep as reference only. Pair with shipped-vs-plan diff requirement in §Definition of Project Complete.
7. **Owners.** §Plan Registry has empty owner columns. **Decision:** formalize per-track agent-role coordinators, or stay informal.

**Resolution precedence:** silent-corrupt questions block specific PRs as noted. Loud-block questions pause the affected PR with an obvious error so there's no silent corruption. Cosmetic questions can be resolved in parallel with any track.

---

## Updating This Document — Rules

1. **Status changes land in the same PR as the work itself.** If PR 7 of memory v3 ships, its commit updates §Plan Registry + §Status Overview.
2. **Shared-resource claims precede the work.** Reserve a migration number or flag **here** first, then open the PR.
3. **Master-plan commits get a standalone commit per update** — never bundled with code changes. Matches the `feedback_never_commit_docs` rule for planning artifacts (this file sits at the boundary — it's coordination, not planning — so it IS committable, unlike per-subsystem plan docs).
4. **Archive, don't delete.** When a plan ships, move its row to §Completed & Archived Plans with a one-line outcome + final commit SHA. Keeps the history queryable.
5. **No strategy drift.** This doc does not set technical direction — that lives in the per-subsystem plan. Master plan is pure coordination: what, where, who, when, and what else it touches.

---

## Completed & Archived Plans (append-only)

### 2026-04-15 — Install-to-Value (7 UX features)
- File: `2026-04-15-001-feat-fulcrum-install-to-value-plan.md`
- Outcome: All 7 UX features shipped. Introduced `FULCRUM_NO_MONITOR`, `FULCRUM_MONITOR_PORT`, `FULCRUM_SETUP_NO_GATE` flags and migrations `m050..m052`. Last commit touching plan: **2026-04-17**.

### 2026-04-15 — Monitor reliability + test gaps
- File: `2026-04-15-002-fix-monitor-reliability-and-test-gaps-plan.md`
- Outcome: All 6 units shipped. No new migrations/flags. Last commit: **2026-04-17**.

### 2026-04-16 — CLI-First Action Platform
- File: `2026-04-16-cli-first-action-platform-plan.md`
- Outcome: Tool-registry refactor shipped; unblocked `plan-plugins` + `plan-mcp`. Last commit: **2026-04-17**.

### (Archive) — 2026-04-15 MASTER-PLAN sprint

The prior master plan (dated 2026-04-15, audit-response sprint) is preserved below for history. **Wave 0 is shipped; Waves 1–3 status is ambiguous and covered under §Open Questions #4.**

<details>
<summary>Click to expand the 2026-04-15 sprint master plan (preserved verbatim)</summary>

_This content is preserved only for audit. Do not act on it directly — use §Plan Registry above for current status._

**Date**: 2026-04-15
**Audit source**: `docs/audit/AUDIT-ROUND2.md`
**Domain plans**: `plan-mcp.md`, `plan-plugins.md`, `plan-skills-agents.md`, `plan-rag.md`, `plan-architecture.md`
**Goal**: Fulcrum becomes a reference-quality implementation across all 6 audited domains

**Wave 0 — Trivial fixes (shipped):** `embedQuery()` for queries, sigmoid reranker, `globalDataDir` import, Origin header validation, `InitializeResult` capabilities, MCP-Protocol-Version header, JSON-RPC error for schema failures, install-skills script, `tags`/`artifact_paths` as arrays.

**Wave 1 — Architecture foundations:** hook types → core; named exports in teams/policy/workflows; policy layer violation fix; core↔teams circular-dep break; embedding registry as plugin registry. **Status: audit needed.**

**Wave 2 — Feature work:** Track A (MCP compliance), Track B (RAG improvements), Track C (Skills & agent definitions — m041, m042 migrations), Track D (plugin architecture), Track E (architecture quality). **Status: audit needed.**

**Wave 3 — Validation:** test suites, madge 0 cycles, `tsc --noEmit`, MCP compliance checklist, A2A v0.3.x schema, install-skills integration, plugin activation smoke test. **Status: not explicitly run post-Wave-2.**

**Success criteria for "Reference Implementation":**
1. MCP: no spec violations, all capabilities declared, security controls in place
2. Plugins: `plugin-discovery.ts` wired and tested; `fulcrum plugin install` works
3. Skills: all 20 skills have `allowed-tools` + invocation control; skills load in Claude Code
4. Agent definitions: single A2A card builder; 3 core roles have system_prompt
5. RAG: `embedQuery()` used for queries; ASTChunker wired; import graph edges emitted
6. Architecture: madge reports 0 cycles; policy does not depend on teams; no `export *`
7. Tests: all suites pass; new tests cover every gap fixed

</details>
