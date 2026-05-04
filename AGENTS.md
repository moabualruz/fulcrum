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

# [fulcrum] recent context, 2026-05-04 11:23pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,576t read) | 584,593t work | 97% savings

### May 4, 2026
457 9:38p 🔴 Sprint migration test assertion mismatch on column expectations
458 " 🔵 doc_links table NOT NULL constraint violations in fixture setup
459 " 🔵 Product kernel initialization test reveals database state issue
460 " 🔵 Test suite results: 14 pass, 5 fail across sprint and doc routes
461 " 🔴 Fixed sprint schema test assertion and doc_links fixture NOT NULL constraint
462 " 🔵 Sprint schema test now passes, but doc routes fail due to missing orgs table
463 9:39p 🔵 Doc route test fixture reveals orgs table missing from migration set
464 " 🔵 Production db setup calls ensureDefaultOrg after migrations, test fixture doesn't
465 " 🔵 ensureDefaultOrg is private function in db.ts, test needs different initialization approach
466 " 🔵 ensureDefaultOrg creates orgs table entry; runMigrations creates schema but not default org
467 9:40p ✅ Updated test fixture to use production db singleton initialization functions
468 " 🔵 Test cleanup functions added but core issue remains: test doesn't seed default org
469 " 🔵 Orgs table IS created by initial migration, but not seeded with default org
470 " 🔵 Doc routes use MikroORM (getDefaultOrgIdOrm) but test fixture uses raw SQL (createLocalOrg)
471 9:41p 🔵 Both ORM and raw SQL paths require default org in orgs table
472 " ✅ Updated ORM to use persistent PGlite storage via productDbDir
473 " 🔵 ORM now finds orgs table but fails to pass query parameters
474 9:42p 🔵 Systemic parameter binding failure in ORM connection.execute across all doc route queries
477 9:43p 🔵 Test Phase 2 Execution Complete — All Tests Passing
475 9:48p 🔵 Database migration suite and core infrastructure tests passing
476 9:49p 🔵 Comprehensive test suite across core subsystems passing
478 9:50p 🔵 Test Phase 2 Completion — Web Layer Test Failures Identified
479 " 🔵 Test suite execution completed with 2205 passing tests across all domains
480 9:51p 🔵 Root-level test execution running successfully with passing test results
481 " 🔵 CI Pipeline Phase 2 Core Infrastructure Tests — All Passing
483 9:55p 🔵 Root test suite continues with search and indexing tests passing
482 9:56p 🔵 CLI Infrastructure Complete — All 15+ Domains with Deterministic Codegen
484 9:57p 🔵 Root test suite running connectors and Symphony HTTP API tests with all passing
485 9:59p 🔵 Root test suite CLI commands and orchestration tests all passing
486 10:02p 🔵 Root test suite completed with 3985/3988 tests passing (1 failure, 2 skips)
487 10:04p 🔵 Public API OpenAPI spec endpoint behavior mismatch identified
488 " 🔴 Fixed public API OpenAPI spec endpoint to be discoverable when flag OFF
490 10:05p 🔴 Fixed flaky OpenAPI spec test by caching at router initialization
491 10:09p 🔵 Phase 2 CI suite executed successfully with comprehensive test coverage
492 10:12p 🔴 Fixed JavaScript heap out-of-memory crash in web:check CI step
505 10:39p 🔵 Symphony orchestration conformance suite fully validated
506 " 🔵 Complete database schema initialized with 42+ migrations applied
507 " 🔵 Fulcrum hook integration validated across 5 agent CLIs
508 " 🔵 Fulcrum diagnostic tooling (doctor command) fully functional
509 " 🔵 Package surface discovery validates all supported package types and runtime assets
510 " 🔵 CLI template and documentation systems operational
511 10:41p 🔵 MCP registry with 17 built-in servers and multi-agent integration
512 " 🔵 Product kernel system with task and sprint management
513 " 🔵 Component executor with hook, MCP registry, rules, and policy application
514 " 🔵 Orchestration claim-lock implements strict mutual exclusion for task assignment
515 " 🔵 Event subscription system with PGlite bridge and WebSocket polling fallback
516 " 🔵 Search system with natural language filter translation and click telemetry
517 10:43p 🔵 Phase 2 execution complete with all 8 plans delivering summaries and comprehensive test validation
S96 GSD Phase 3 Discussion: Test-Driven Development Methodology (Question 2/4 - Conformance Proof) (May 4 at 11:09 PM)
S97 GSD Phase 3 Discussion: Conformance Documentation Maintenance Strategy (Question 3/4 - Conformance Proof) (May 4 at 11:09 PM)
S98 GSD Phase 3 Discussion: CI Agent Binary Testing Requirements (Question 4/4 - Final Conformance Proof) (May 4 at 11:09 PM)
S99 GSD Phase 3 Discussion: Sandcastle Run Record Persistence Requirements (Question 1/4 - Artifact + Session) (May 4 at 11:10 PM)
S100 GSD Phase 3 Discussion: Artifact Harvest Configuration Strategy (Question 2/4 - Artifact + Session) (May 4 at 11:10 PM)
S101 GSD Phase 3 Discussion: Session Resume Behavior for Retries (Question 3/4 - Artifact + Session) (May 4 at 11:10 PM)
S102 GSD Phase 3 Discussion: Token Usage Accounting Strategy (Question 4/4 - Final Artifact + Session) (May 4 at 11:10 PM)
S103 GSD Phase 3 Discussion Complete: Architecture Decisions Documented and Committed (May 4 at 11:10 PM)
534 11:12p ✅ Phase 3 Architecture Context and Discussion Log Created
535 " ✅ Phase 3 Documentation Committed to Repository
S104 Initialize planning phase for Phase 3 (Symphony + Sandcastle) after successful discuss-phase completion (May 4 at 11:13 PM)
S105 Initialize Phase 3 (Symphony + Sandcastle) planning after discuss-phase completion; prepare plan-phase workflow and present research decision gate (May 4 at 11:14 PM)
**Investigated**: Comprehensive review of plan-phase orchestrator (15-step workflow with initialization, research gate, planning, verification, gaps analysis, and auto-advance). Reference materials examined: UI patterns (banners, checkpoints, status symbols), revision loop pattern (Check-Revise-Escalate with max 3 iterations and stall detection), gate prompts (approve-revise-abort, yes-no, scope-confirm, etc.), agent contracts (completion markers for gsd-planner, gsd-plan-checker, gsd-phase-researcher), and gates taxonomy (pre-flight, revision, escalation, abort). Phase 3 artifacts loaded: 03-CONTEXT.md with 22 locked implementation decisions, 03-DISCUSSION-LOG.md audit trail, REQUIREMENTS.md (27 Symphony + 6 Sandcastle + 4 Router/Skills items), ROADMAP entry with TDD conformance suite requirement, and STATE.md showing Phase 2 complete.

**Learned**: Plan-phase workflow is a structured 15-step orchestrator that gates research → planning → verification → gaps → auto-advance. Step 5.1 (Standard Research Decision) presents user with explicit research/skip choice. Phase 3 context is comprehensive (22 decisions in 5 categories: Tracker Authority D-01..05, WORKFLOW.md Runtime D-06..09, Dispatch + Sandbox D-10..14, Conformance Proof D-15..18, Artifact + Session D-19..22, plus agent's discretion). Phase 3 requirements span three pillars: Symphony conformance (SYM-01..27 covering WORKFLOW.md, tracker adapter, poll/retry/stall/reconciliation, app-server dispatch, HTTP extension, approval posture, run lifecycle), Sandcastle (SND-01..06 covering noSandbox dispatch, artifact harvest, adapter-swap tests, provider detection, session JSONL, multi-surface dispatch), Router/Skills (RTR-01..04 covering rules-engine matching, learned rules, LLM routing, skill sync). Conformance proof requires RED-first TDD methodology with generated symphny-conformance.md as source of truth.

**Completed**: Discuss-phase successfully completed (20 questions, 22 documented decisions). Committed 03-CONTEXT.md and 03-DISCUSSION-LOG.md to git (dc8dac58). Phase 2 fully executed and verified (8 plans, 18 total completed plans, 100% progress). Git state: branch dev/v1.0 [ahead 1] with AGENTS.md modified. Current session: loaded plan-phase orchestrator, read all reference materials, validated Phase 3 roadmap entry, loaded init.plan-phase JSON (sonnet researcher, opus planner, sonnet checker; research_enabled=true, plan_checker_enabled=true, commit_docs=true), examined phase directory (03-CONTEXT.md, 03-DISCUSSION-LOG.md), verified no existing plans, confirmed config defaults (all workflow gates unset = defaults active).

**Next Steps**: Awaiting user response to research decision gate (Step 5.1): user must reply with `1` (research first) or `2` (skip research) to proceed. Based on response: if `1`, spawn gsd-phase-researcher with CONTEXT.md to investigate Symphony SPEC.md details, orchestration patterns, Sandcastle dispatch mechanisms, and track the returned 03-RESEARCH.md. If `2`, proceed directly to Step 6 (Check Existing Plans) → Step 7 (context paths) → Step 8 (spawn gsd-planner with CONTEXT.md + REQUIREMENTS.md) → planning completion → Step 10 (spawn gsd-plan-checker) → Step 12 revision loop if needed → Step 13 coverage gates → final status. Each major step will display UI banners per references/ui-brand.md patterns. Revision loop uses stall detection (issue count must decrease between iterations, max 3 iterations).


Access 585k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
