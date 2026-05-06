# Fulcrum — AGENTS.md

> Project-level instructions for any agent (or human) working in this repo.

## What Fulcrum is becoming

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

That destination. Current `main` = foundation work: cross-agent install layer, hook plumbing, skills, rules, output policy, component lifecycle, package mirrors, MCP registry, CLI orchestrator everything else sit on top of. Mile zero of long road; every commit advance foundation, not jump ahead.

## Where we are right now (foundation)

Current `main` foundation includes:

- One Bun-compiled `fulcrum` binary, eight hook subcommands (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`).
- Orchestrator (`fulcrum init / install / hooks / skills / doctor / compress`) wires hooks into five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI).
- Sentinel-block rules splicer for cross-agent rules distribution.
- Per-tool output-handling policy (`config/tool-output-policy.toml`) drives `tool-output-router` hook.
- 29 in-repo skills caveman-compressed (`.original.md` beside each), 20-entry trigger evals each, content-verified against upstream sources.
- `src/agents/registry.ts` — canonical `Agent` interface + `AGENTS[5]` array; single source of truth consumed by install, doctor, skills. No more inline agent configs scattered across files.
- `fulcrum install --profile minimal|rules-only|full --dry-run` support; `fulcrum doctor --json` for machine-readable health output.
- `bun run compress` (`src/cli/compress.ts`) — idempotent caveman compression of in-repo content; `--check` for CI.
- Local CI runner (`bun run ci`) — 6 stages: install / typecheck / test / build:all / skills:lint / compress:check (hard gate). Local release runner (`bun run release vX.Y.Z`). `fulcrum doctor` shows caveman `defaultMode`, per-agent install state, MCP health, skill metadata budget, and ignored project worktree warnings. Skills lint enforces rules ≤ 200 lines. CHANGELOG via `git-cliff`.

## Where we are going (placeholders, not implementations)

Layers foundation prep for. **Not built yet** — do not assume exist or write code depending on them. Listed so anyone reading repo see trajectory.

- **Repository supervisor** — multi-repo awareness, work-tree state, branch posture.
- **Task system** — durable units of work (issues/tasks) tracked across agent sessions.
- **Agent runs** — first-class agent invocations with inputs, outputs, transcripts, retries.
- **Context engine** — selecting + assembling what each run sees, beyond existing rules splice.
- **Memory** — persistent facts, decisions, references across sessions.
- **Artifacts** — outputs of runs (diffs, plans, reports) tracked, addressable, queryable.
- **Plugins / extensions** — generic `fulcrum plugins …` UX for third-party drop-ins. Package-specific lifecycle mirroring already exists for Caveman, Repomix, Cloudflare, and Superpowers.

## Skill namespacing — the `fulcrum:` prefix

`fulcrum skills sync` distributes authored skills using each agent's native namespacing primitive:

```
Claude Code: plugin (fulcrum@fulcrum)
             ~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/SKILL.md
             invocation: /fulcrum:<name>
Codex CLI:   ~/.codex/skills/fulcrum/<name>/SKILL.md            (global opt-in)
             .codex/skills/fulcrum/<name>/SKILL.md              (project opt-in)
OpenCode:    ~/.config/opencode/skills/fulcrum/<name>/SKILL.md  (nested supported)
Pi CLI:      ~/.pi/agent/skills/fulcrum/<name>/SKILL.md         (nested supported)
Gemini CLI:  ~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md
             (extension itself is the namespace)
```

**Why Claude Code differs:** Claude Code's skill loader scans the **top level** of `~/.claude/skills/` only. The `<dir>/fulcrum/<name>/` layout other agents use is invisible to it (open issues anthropics/claude-code#28266, #18192, #39138). Plugin namespace is the supported path — `.claude-plugin/marketplace.json` at repo root declares the `fulcrum` marketplace, `.claude-plugin/plugin.json` declares the plugin. `fulcrum skills sync` runs `claude plugin marketplace add moabualruz/fulcrum && claude plugin install fulcrum@fulcrum`. Skills surface as `/fulcrum:<name>` (e.g. `/fulcrum:jq`).

Other agents (Codex, OpenCode, Pi) walk nested skill dirs natively; Gemini uses an extension scope. Codex global authored skills are skipped by default to avoid user-wide metadata pressure; use `fulcrum skills sync --codex-global` or `--codex-project <dir>` explicitly. All five end up with the same effective `fulcrum:<skill-name>` address space, but the install mechanism differs by agent. Agents still invoke skills by frontmatter `name:` (no colons in identifiers — namespacing path-based or plugin-mediated).

**Migration:** Old Claude Code installs that wrote to `~/.claude/skills/fulcrum/<name>/` are removed automatically by `fulcrum skills sync` after the plugin install succeeds. Re-running `fulcrum install` is idempotent; if the plugin is already registered in `~/.claude/plugins/installed_plugins.json`, the install step is skipped.

## Cross-agent rules distribution

`fulcrum install` reads `rules/AGENTS.md`, sentinel-splices body into each detected agent's primary rules file. User content outside `<!-- BEGIN/END FULCRUM RULES -->` markers preserved verbatim. Idempotent — re-running `fulcrum install` replaces only spliced block.

| Agent | Primary rules file | Method |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | sentinel splice |
| Codex CLI | `~/.codex/AGENTS.md` | sentinel splice |
| OpenCode | `~/.config/opencode/AGENTS.md` (also reads `~/.claude/CLAUDE.md`) | sentinel splice |
| Pi CLI | `~/.pi/agent/AGENTS.md` | sentinel splice |
| Gemini CLI | `~/.gemini/GEMINI.md` | body placed at `~/AGENTS.md`; `GEMINI.md` becomes single line `@AGENTS.md` (Gemini inlines `@` imports) |

Project-level enforcement: drop `rules/AGENTS.md` at `<consumer-repo>/AGENTS.md` (or `<consumer-repo>/GEMINI.md` for Gemini-only repos).

Companion artifacts travel with rules:

- Hook recipes — `hooks/recipes/*.snippet.md`, vendored to `~/.fulcrum/hooks/snippets/` by install. Per-agent registration in `docs/hooks.md`.
- Skill registry — `skills/SOURCES.md`. `fulcrum skills sync` mirrors `skills/<name>/` to each agent's native namespace, excluding `.original.md` and source-only folders from generated CLI agent mirrors while keeping them in project source.

## Conventions that apply to current work

- **Skills are one tool, one skill.** Don't fold multiple unrelated tools into one SKILL.md. Exception: two CLIs tightly coupled + ship together (e.g. `dart format` + `dart analyze` → `dart-toolchain`).
- **Skill content correctness not implied by lint.** `fulcrum skills lint` verify frontmatter shape + five required H2 sections. Does **not** verify flags, default values, subcommands accurate against upstream. Authors must verify against tool's `--help` or upstream README before submitting. Previous batch found 46% content-error rate among parallel-authored skills — assume same risk on new ones.
- **Reuse-first product engineering.** Before non-trivial product/platform feature, research free/open-source tools, libraries, schemas, UI blocks, workflow engines, CLIs, self-hostable apps. Prefer deps + embeddable/local/self-hosted building blocks over bespoke code; hosted third-party integrations OK when they materially shorten path without compromising local-first defaults. If candidate covers ~75%+ with acceptable license/runtime/ownership risk, adopt it and build gap. If fit <~75%, strategic, or unclear, stop and present options for user choice before building.
- **Documentation retrieval deterministic by default.** For Fulcrum project-management, documentation, memory, context surfaces, do not introduce embeddings, RAG pipelines, semantic search, or local/remote model deps unless user explicitly approves design. Prefer structured metadata, full-text search, filters, backlinks, source refs, task/doc relationships, deterministic query/index engines.
- **No GitHub Actions workflows by default.** Local `bun run ci` + local `bun run release` = gates. If workflow added later, must be additive, not source of truth.
- **No new docs files unless asked.** Update existing docs in place; don't generate planning, decision, or analysis markdown alongside code changes.
- **One commit per logical change.** Bisect granularity matter — separate fixes from features.

## How to read this repo

- `README.md` — install + usage.
- `HANDOVER.md` — current-state snapshot, outstanding work, recent decisions.
- `docs/` — per-topic foundation docs (context, hooks, skills, mcp, agents, capabilities, tool-output policy).
- `docs/caveman.md` — reference: what gets compressed, install, defaultMode, CI gate, doctor, opt-out.
- `rules/AGENTS.md` — body sentinel-spliced into each agent's primary rules file. Different audience from this file: that = "how agent should behave inside any project", this = "what fulcrum is + where going".
- `src/agents/registry.ts` — start here to understand how five agents defined; consumed by install, doctor, skills.
- `skills/SOURCES.md` — skill registry + authoring queue.

## Agent skills

### Issue tracker

Issues tracked as local markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` at root pointing to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.


<claude-mem-context>
# Memory Context

# [fulcrum] recent context, 2026-05-06 12:42pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (27,766t read) | 1,174,807t work | 98% savings

### May 6, 2026
1671 10:13a 🔵 Web dashboard architecture uses async-streamed loaders with product kernel queries
1672 " 🔵 Seed script populates local product DB with demo projects, tasks, docs, and agent runs
1673 " 🔵 Product kernel schema defines core entities with event dispatch and search indexing integration
1675 10:14a 🔵 Web shell uses singleton PGlite connection pattern for zero per-request DB overhead
1676 " 🔴 Runtime schema mismatch: code queries nonexistent "sandbox_mode" column
1677 " 🔵 Multiple Svelte reactivity warnings indicate state management anti-patterns in components
1678 " 🔵 Vite cannot analyze dynamic import in migrator-service.ts; build warning
1679 " 🔵 Schema mismatch: sandbox_mode column defined in MikroORM migration but not product-kernel schema
1680 " 🔵 GET /runs directly queries sandbox_mode and iteration_count columns that don't exist in product-kernel schema
1681 " 🔵 Web shell code references 18 agent_runs columns only defined in MikroORM migrations, not product-kernel
1682 10:15a 🔴 Added product-kernel migration to bridge schema gap between web code and product-kernel DB
1683 " 🔵 Migration system is consistently used across CLI, web shell, and tests via centralized runMigrations API
1684 " 🔴 Migration 0009_agent_runs_sandcastle_compat.sql successfully applied to product DB; sandbox_mode and iteration_count columns now exist
1686 " 🔴 Web shell /runs page now returns HTTP 200; schema mismatch resolved
1687 11:06a 🔵 Data Access Layer Consolidation: EntityManager + needle-di Repositories
1688 " 🔵 Authentication & Authorization: Session-Based with Casbin ABAC Gate
1689 " 🔵 Public REST API: Unified Hono Entry Point (ARCH-09)
1690 " 🔵 Event Dispatcher & Notification System: Persist-Publish Architecture (ARCH-04)
1691 11:08a ⚖️ Phase 9.5 Architectural Framework & Application Layer: Reject NestJS/Elysia, Build Explicit Application Boundary
1692 " ⚖️ Application Layer Boundaries: Authorization, Validation, Events, Errors
1693 " ⚖️ Phase 9.5 Acceptance Criteria: Vertical-Slice Rollout with Test & Performance Gates
1694 11:09a ✅ Phase 9.5 Research Complete: 25 Gray Areas Resolved, 3 Wizard Questions Remain
1695 " ✅ Phase 9.5 Research Ready for Wizard Input: 3 Decision Points Formulated
1696 11:12a ⚖️ Phase 9.5 User Decisions Locked: Paper First, Strict Allowlist, Tiered Mandatory
1697 11:44a 🔵 Phase 9.5 Architecture Audit: Direct DB Access and Integration Gaps Mapped
1698 11:51a ⚖️ Phase 9.5 Architecture: Gray Area Resolutions Documented (25 Decisions)
1699 11:53a 🔵 Yjs Not Present; Realtime Built on EventBus + PGlite LISTEN/NOTIFY Bridge
1700 " 🔵 Yjs Document Collab Already Implemented; Feature-Gated Behind FULCRUM_FEATURES
1701 11:56a ✅ Phase 9.5 Context Consolidated: 57 Architecture Decisions Documented
1702 " ✅ Phase 9.5 Discussion Log: Decisions Captured Across 2 Sessions + 7 Gap Resolutions
1703 11:59a 🔵 Codebase Data Access Inventory: 52 Web Routes, 80+ Entities, 16 Legacy Domains, 25+ Direct DB Imports
1704 12:01p ✅ Phase 9.5 CONTEXT.md Enriched: Violation Inventory + Domain Module Mapping Added
1705 12:02p ✅ Phase 9.5 Discussion Output: Planning Docs + Code Modifications Staged (20 files, 466 insertions)
1706 12:05p 🔵 Graphify Knowledge Graph Built: 9623 Nodes, 22284 Edges, 520 Communities
1707 " ✅ Codebase Knowledge Graph Archived: graph.json (9623 nodes, 22284 links) + GRAPH_REPORT.md Stored in .planning/graphs/
1708 12:16p 🔵 Codebase Mapper Agent Architecture and Parallel Execution Strategy
1711 12:18p 🔵 Stub CRUD routers with empty implementations in tRPC layer
1712 " 🔵 Mixed data access patterns: ProductDb (raw SQL) vs EntityManager coexistence
1713 " 🔵 Extensive feature flag gating of unimplemented domains and connectors
1714 " 🔵 Unimplemented test cases and skipped test suite areas
1715 " 🔵 Database migration system complexity and compatibility concerns
1716 " 🔵 HTML sanitization and markdown rendering fragmentation across surfaces
1717 " 🔵 Credential encryption and secret management via local keyring fallback
1709 12:19p 🔵 Mapper Agent Execution: Concerns Analysis Complete, Multi-Agent Orchestration
1710 " 🔵 Quality Mapper Agent Completion: Conventions and Testing Analysis
1718 12:20p 🔵 Tech Stack Mapper Agent Completion: Stack and Integrations Analysis
1719 12:21p 🔵 Architecture Mapper Agent Completion: All Codebase Documents Updated
1720 12:22p ✅ Codebase Mapping Documents Updated: 1,739 Lines Across 7 Files
1721 " ✅ Codebase Mapping Committed to dev/v1.0 Branch
1722 " ✅ Codebase Mapping Workflow Complete: Ancillary Changes in config.json and AGENTS.md
S315 Deep audit of Phases 1-10: inventory code structure (CLI/TUI/Web/API), verify Phase 1-9 completion claims against current codebase, identify gaps for Phase 9.5 remediation (May 6 at 12:24 PM)
S316 Analyze Fulcrum codebase for coding conventions and testing patterns; document findings in CONVENTIONS.md and TESTING.md at .planning/codebase/ using 2026-05-06 date placeholder (May 6 at 12:25 PM)
S317 Comprehensive multi-phase audit (Phases 1-9) of completion claims vs actual code state, followed by Phase 9.5 gap analysis and planning preparation (May 6 at 12:25 PM)
S318 Complete multi-phase audit synthesis (Phases 1-9) and present comprehensive gap analysis for Phase 9.5 planning decision (May 6 at 12:26 PM)
S319 Codebase architecture and directory structure analysis—generate ARCHITECTURE.md and STRUCTURE.md documents in .planning/codebase/ with 2026-05-06 analysis date (May 6 at 12:26 PM)
S320 Complete cross-phase audit (Phases 1-9) synthesis and integrate findings into Phase 9.5 specification and context documentation (May 6 at 12:29 PM)
S321 Analyze Fulcrum codebase for technology stack and external integrations; write STACK.md and INTEGRATIONS.md to .planning/codebase/ using 2026-05-06 as date placeholder (May 6 at 12:31 PM)
S322 Complete cross-phase audit synthesis and establish comprehensive Phase 9.5 specification, context, gap analysis, and UAT baseline documentation (May 6 at 12:32 PM)
S323 Complete comprehensive cross-phase audit of Phases 1-9 and synthesize findings into Phase 9.5 specification documents, preparing documentation for implementation planning with subsequent `/gsd-plan-phase 9.5` invocation. (May 6 at 12:33 PM)
S324 Operationalize Phase 9.5 implementation readiness: design tiered CI infrastructure, codify TDD policy as phase constraints, and verify infrastructure execution targets are met. (May 6 at 12:42 PM)
**Investigated**: Examined existing CI pipeline structure in scripts/ci.ts (21 sequential steps, soft-fail semantics, summary reporting). Analyzed current monolithic execution model (~5 min full run). Identified need to support granular developer feedback loops without abandoning rigor at phase gates. Reviewed Phase 9.5 documentation foundation (24 requirements, 71 decisions, 285 test specs) for integration points.

**Learned**: CI orchestrator uses typed Step objects with optional soft/cwd/env fields and child_process spawning. Soft failures allow pipeline continuation without blocking (e.g., missing caveman compiler). Pending file detection via stderr pattern matching suggests artifact compression system. Phase 9.5 UAT baseline (6 test layers, 91 files) requires integration into existing orchestration without creating monolithic runtime bottleneck. TDD policy enforcement demands git-log verification of test-first discipline, not post-facto test existence checks.

**Completed**: Refactored scripts/ci.ts: 21 steps reorganized from flat array into ALL_STEPS with tier (quick/unit/integration/e2e/full) and domain (application/web/cli/tui/api/all) metadata. STEPS now derived via filtering: tierIncludes(tier) && domainIncludes(domain). Tier order is cumulative (quick ⊂ unit ⊂ integration ⊂ e2e ⊂ full). Added CONTEXT.md decisions D-72→D-78: D-72-75 strict TDD (RED→GREEN→REFACTOR, 9-step test order per domain), D-76-78 CI tier strategy with timing targets and domain focus. Updated SPEC.md from 22 to 24 locked requirements: R-23 (strict TDD with git-log acceptance), R-24 (tiered CI with timing SLOs <15s quick, <45s unit). Added cross-reference table entries for R-23/R-24. Expanded acceptance criteria checklist from 24 to 29 items, including TDD evidence + tier timing + domain filtering + full CI gate. Committed e243f371 (3 files, 105 insertions). Verified `bun run ci --tier=quick` achieves 8.3s (install 0s + typecheck 8.3s), passes R-24 acceptance criterion (<15s).

**Next Steps**: Phase 9.5 documentation and infrastructure complete and committed. All 24 requirements locked with falsifiable acceptance criteria. Full cross-reference traceability: ROADMAP SC → SPEC R → CONTEXT D → scripts/ci.ts → UAT-BASELINE. Tiered CI architecture operationalized and tested. TDD policy codified and binding. Ready for implementation planning phase: `/gsd-plan-phase 9.5` to begin task breakdown, resource allocation, and vertical-slice rollout (tasks domain first).


Access 1175k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
