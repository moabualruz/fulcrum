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

# [fulcrum] recent context, 2026-05-06 11:12am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,557t read) | 799,725t work | 98% savings

### May 6, 2026
1640 3:53a 🔵 Interactive CLI Flows with Non-Interactive Mode (Exit Code 7)
1641 " 🔵 Skills Management with Conflict Resolution and Cron Scheduling
1647 3:54a 🔵 Symphony Candidate Eligibility Based on Blocker Terminal State
1648 " 🔵 Token Tracking and Cap Enforcement in Agent Runs
1649 " 🔵 Session Resume with Codex Thread/Resume and Transcript-Path Fallback
1650 " 🔵 Transcript Capture with Size Enforcement and Truncation Detection
1651 " 🔵 Phase 08 REST API with OpenAPI 3.1 and Rate Limiting Headers
1652 " 🔵 Sprint Closure Event Handler with Graceful Degradation
1653 " 🔵 Feature-Gated Importers with Field Mapping (Linear, Jira, Plane)
1654 " 🔵 Notification System: Fanout, Bell Counter, and Multi-Channel Delivery
1655 " 🔵 Migration Reversibility with Partial Indexes and Orchestration State Validation
1656 " 🔵 Agent Runs Symphony Columns with Cross-Org Protection and Cascade Delete
1657 " 🔵 Custom Field Definition Schema with Per-Type Config Validation
1658 " 🔵 Sprint Schema with One-Active-Per-Project Constraint and Cascade Delete
1659 " 🔵 Memory Entity with PRD Core Properties and Five Indexes
1660 " 🔵 Memory Schema Idempotent on File-Backed PGlite with Round-Trip CRUD
1661 " 🔵 Artifact and Edge Schema with Organization-Scoped Indexing
1662 " 🔵 Events Backfill Migration with Composite DESC Indexes and Null-Org Default
1663 " 🔵 Documents Schema with Comprehensive FK Deletion Behavior and Enum Constraints
1664 3:55a 🔵 Cross-Org Data Isolation Across Document Relationships
1665 " 🔵 Pillar 17 Cross-Cutting Platform: Credentials, Telemetry, Errors, Experiments, Feature Flags
1666 " 🔵 Inference Backends with Multiple Implementations (Embedded, Ollama, LmStudio, OpenAI)
1667 " 🔵 Phase 08 Test Suite Completion: 4616 Pass, 2 Skip, 7 Todo, 0 Fail
1668 " 🔵 OpenTUI Cross-Platform Binary Build Dependency Resolution Issue
1669 3:56a 🔵 OpenTUI Platform Binary Import Resolution and Cross-Compilation Workaround
1670 8:57a ⚖️ Phase 10 SaaS Hardening + Milestone Closure achieves final convergence review verdict
1671 10:13a 🔵 Web dashboard architecture uses async-streamed loaders with product kernel queries
1672 " 🔵 Seed script populates local product DB with demo projects, tasks, docs, and agent runs
1673 " 🔵 Product kernel schema defines core entities with event dispatch and search indexing integration
1674 " 🔵 Document and task service layers dispatch events and index search on create/update/delete
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
S289 Transition from Phase 10 feature implementation to strategic integration failure audit and architecture remediation planning (May 6 at 10:20 AM)
S290 Refine architecture recommendation from "NestJS vs keep SvelteKit" to "unified data manipulation layer is non-negotiable" with specific boundary requirements and dependency rules (May 6 at 10:38 AM)
S291 Define API architecture strategy: how tRPC and REST/Hono should be structured as thin adapters over unified application services, with hard boundary rule preventing direct DB access from surface code (May 6 at 10:41 AM)
S292 Analyze Hono vs NestJS framework choice and define decision-making process for backend architecture; defer framework selection until after unified application layer is established and validated through a spike (May 6 at 10:44 AM)
S293 Continue from previous session: Execute 6 audit documents (A-F) and establish unified data manipulation layer architecture enforcement (May 6 at 10:45 AM)
S294 Organize and execute the 6 audit documents (A-F) needed to resolve architectural problems discovered in Phase 10 before resuming feature work (May 6 at 10:47 AM)
S295 Continue from previous session: Execute Phase 9.5 (Architecture/Data-Layer Remediation + Full Interface Integration Fix) as urgent blocker before Phase 10 can proceed. Establish comprehensive plan for unified data manipulation layer, research backend architecture alternatives, and define spike vertical slice implementation. (May 6 at 10:49 AM)
S296 Phase 9.5 remediation planning: Create execution plan for 6 audits (A-F) based on completed research; plan the consolidated codebase analysis before implementation begins (May 6 at 10:54 AM)
S297 Phase 9.5 Execution Planning: Full Architecture Overhaul with Feature Preservation Mandate and Gray Area Research Framework (May 6 at 10:59 AM)
1687 11:06a 🔵 Data Access Layer Consolidation: EntityManager + needle-di Repositories
1688 " 🔵 Authentication & Authorization: Session-Based with Casbin ABAC Gate
1689 " 🔵 Public REST API: Unified Hono Entry Point (ARCH-09)
1690 " 🔵 Event Dispatcher & Notification System: Persist-Publish Architecture (ARCH-04)
1691 11:08a ⚖️ Phase 9.5 Architectural Framework & Application Layer: Reject NestJS/Elysia, Build Explicit Application Boundary
1692 " ⚖️ Application Layer Boundaries: Authorization, Validation, Events, Errors
1693 " ⚖️ Phase 9.5 Acceptance Criteria: Vertical-Slice Rollout with Test & Performance Gates
1694 11:09a ✅ Phase 9.5 Research Complete: 25 Gray Areas Resolved, 3 Wizard Questions Remain
1695 " ✅ Phase 9.5 Research Ready for Wizard Input: 3 Decision Points Formulated
S298 Phase 9.5 Gray Area Resolution Research: investigate architecture patterns online and in codebase, document findings, and prepare wizard questions for remaining decisions (May 6 at 11:09 AM)
**Investigated**: 25 gray areas spanning backend frameworks (NestJS, Elysia, Fastify, Express, Koa, hapi, GraphQL, Encore.ts, Effect Platform), data access patterns (EntityManager, repositories, needle-di), application layer structure, authorization boundaries, error taxonomy, event/notification architecture, migration consolidation, test strategy, and rollout approach. External sources: official docs for Bun, Hono, NestJS, Elysia, Fastify, MikroORM, tRPC. Project evidence: 1679 lines of grep results on architecture terms; examination of src/trpc/context.ts, src/trpc/middleware.ts, src/db/db.module.ts, src/api/hono.ts, src/product-kernel/event-dispatcher.ts, and notification/rule-engine implementation.

**Learned**: Current architecture consolidates around MikroORM EntityManager with needle-di dependency injection; tRPC and Hono REST are thin adapters; ProductDb deprecated, retained only for legacy orchestration pending migration; authorization handled by assertPermission middleware with two phases (session check + optional casbin ABAC); EventDispatcher provides unified event entry point; NotificationRuleEngine matches events to delivery channels (in-app, email, push, webhook); existing infrastructure already supports the proposed application-layer boundary pattern.

**Completed**: Created 09.5-GRAY-AREA-RESOLUTIONS.md documenting 25 resolved decisions (G-001 through G-025) with rationale for each: keep Hono+tRPC as thin adapters, build src/application/<domain>/ layer with commands/queries/services/schemas/errors/DTOs, needle-di for DI, commands own transactions, authorization at application entrypoint, unified error taxonomy, outbox pattern for events, MikroORM-only migrations, product-kernel deprecated, vertical-slice rollout, performance gates, security threat model. Updated ROADMAP.md, 09.5-CONTEXT.md, and 09.5-DISCUSSION-LOG.md with artifact references. Audit directory created with web routes, CLI/TUI files, DB access patterns, and E2E analysis.

**Next Steps**: User must answer three wizard questions about risk appetite before Phase 9.5 implementation planning can proceed: (1) Backend spike policy (Paper First recommended vs. Spike Nest+Elysia vs. Spike One), (2) ProductDb shim allowance during migration (Strict Allowlist recommended vs. Hard Fail Now vs. Loose Transition), (3) Playwright E2E gate placement (Tiered Mandatory recommended vs. Full Normal CI vs. Release Full). After user provides choices, session can run /gsd-plan-phase 9.5 to generate implementation plans based on research and decisions.


Access 800k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
