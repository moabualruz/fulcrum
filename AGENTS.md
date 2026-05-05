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

# [fulcrum] recent context, 2026-05-05 11:36am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,118t read) | 612,521t work | 97% savings

### May 5, 2026
S177 Peer review Phase 5 planning artifacts (15 plans, 111 decisions, 5 waves) for the Fulcrum Task Management + Metrics project; synthesize findings into structured review document (May 5 at 9:26 AM)
S178 Peer review Phase 5 planning artifacts (Task Management + Metrics) with comprehensive quality gates; also distribute research enforcement rules to all agent platforms; capture Phase 3/4 gap audit findings (May 5 at 9:39 AM)
S179 Clarify whether Gemini uses GEMINI.md, AGENTS.md, or both for configuration/documentation (May 5 at 9:46 AM)
S180 Peer-review Phase 5 planning artifacts (Task Management + Metrics) for the Fulcrum project, reading all 15 plan files plus context/research/gap audit, and writing findings to 05-REVIEWS.md with focus on executability, dependency correctness, decision coverage, architectural risks, and wave parallelism. (May 5 at 9:55 AM)
S181 Initial greeting - session just started (May 5 at 9:55 AM)
S182 Continue from previous session context: Complete Phase 05 planning reviews with focus on test-driven development (Nyquist compliance), ensuring all 10 test files are properly scoped and synchronized across Plan 00 (RED stubs) and Plan 10 (implementation/GREEN). (May 5 at 10:18 AM)
832 10:33a 🔵 Phase 05 Wave 0 planning review expanded test scope to 10 files; cross-plan consistency applied
833 10:34a ✅ Plan 10 Task 2 updated to include CalendarView.test.ts; task renamed to include GREEN test responsibility
S183 Verify whether task management plans include nested comments and threaded reply support (May 5 at 10:34 AM)
S184 Investigate whether task management plans document nested comments, threading, and task hierarchy — and identify gaps between requirements (CONTEXT.md D-01) and implementation plans (May 5 at 10:56 AM)
834 10:58a 🔵 Task hierarchy, threading, and workflow requirements confirmed in CONTEXT.md and RESEARCH.md
835 10:59a 🔵 Task entity already implements parent_id for hierarchy, contradicting plan gaps
836 " 🔵 Project entity not yet integrated into MikroORM entity graph
S185 Continue Phase 05 task-management-metrics planning from previous session and create summary documents for completed planning phases (May 5 at 10:59 AM)
837 11:02a ✅ Plan 01 updated with task_type enum and methodology configuration columns
838 " ✅ Plan 01 extended with enum constants and Task.taskType property for hierarchy and methodology
839 " ✅ Plan 01 acceptance criteria updated to include task type, methodology, and enum constants
840 11:03a ✅ Plan 03 (CommentService) extended with nested comment threading methods
S186 Competitive feature gap analysis for Phase 5 task-management-metrics plans — identify what Linear, Jira, Asana, Plane, ClickUp, GitHub, and Notion have that Fulcrum Phase 5 is missing or handles weakly (May 5 at 11:09 AM)
841 11:23a ⚖️ Documented 12 competitive gap features (D-112–D-123) for task management system
842 " ✅ Added 4 new deferred feature items to planning context
843 " ✅ Added 3 new columns to tasks table migration for Phase 5 features
844 11:24a ✅ Added 3 new columns to projects table migration for D-112 and D-117 features
845 " ✅ Added 2 new tables (task_templates, task_recurrence_rules), pg_trgm extension, and 4 strategic indexes to migration plan
846 " ✅ Added 5 new acceptance criteria to Phase 5 migration plan
847 " ✅ Added 2 new entity classes (TaskTemplate, TaskRecurrenceRule) to Phase 5 entity plan
848 11:25a ✅ Documented complete MikroORM entity specifications for TaskTemplate and TaskRecurrenceRule
849 " ✅ Added barrel exports for TaskTemplate and TaskRecurrenceRule entities
850 " ✅ Added 6 new service files to Phase 5 Plan 04 (Services & Business Logic)
851 11:26a ✅ Documented 13 new service methods in Plan 04 for D-115, D-116, D-122, D-123 features
852 " ✅ Documented detailed implementation specs for RelationshipService enhancements and TemplateService/RecurrenceService
853 11:27a ✅ Documented TRPC router definitions for D-115 templates, D-116 recurrence, D-122/D-123 relationships
854 " ✅ Added templatesRouter and recurrenceRouter imports to Plan 06 (Router Assembly)
855 " ✅ Mounted templatesRouter and recurrenceRouter in Plan 06 AppRouter
856 " ✅ Added task ID badge display to TaskDetailPanel section 1 in Plan 07 (UI Components)
857 11:28a ✅ Added estimation scale picker to TaskDetailPanel section 2 status/metadata bar in Plan 07
858 " ✅ Added 3 new TaskDetailPanel sections for D-114, D-116, D-123 features in Plan 07
859 " ✅ Added D-112 task ID display to TaskCard compact and comfortable modes in Plan 08
860 " ✅ Added quick-create column header button and My Work view toggle to Plan 08 board features
861 " ✅ Added "My Work" quick filter to Plan 11 QuickFilters component
862 " ✅ Added "Include archived" toggle and "Export" button to Plan 11 filter toolbar
863 11:29a ✅ Documented Archive bulk action implementation in Plan 11 BulkBar
864 " ✅ Added QuickCreateForm.svelte to Plan 12 files_modified for D-113 quick-create component
865 " ✅ Annotated C key keyboard binding to reference D-113 QuickCreateForm callback in Plan 12
866 " ✅ Documented comprehensive QuickCreateForm component specification for D-113 in Plan 12
867 " ✅ Added task ID search capability to Cmd+K CommandPalette in Plan 12
868 11:30a ✅ Added 3 new CLI command files to Plan 14 for D-119, D-120, D-121 features
869 " ✅ Added 7 new CLI command behaviors to Plan 14 for competitive gap features
870 " ✅ Documented comprehensive CLI command implementations for D-119, D-120, D-121, D-112, D-114 in Plan 14
871 11:31a ✅ Added 3 TUI enhancements for D-112, D-119, D-114 to Plan 14
872 " ✅ Added RecurrenceConfig and import settings page to Plan 15 files_modified
873 " ✅ Documented import settings page and RecurrenceConfig component specifications in Plan 15
874 " 🔵 Verified comprehensive integration of 12 competitive gap features (D-112–D-123) across all Phase 5 planning documents
875 11:32a ✅ Committed all Phase 5 planning document enrichments with 12 competitive gap features to version control
876 " 🔵 Phase 5 enrichment task completed: 12 competitive gap features integrated across all planning documents
879 11:35a 🔵 Phase 5 Planning: 15-Plan Structure with 6-Wave Dependency DAG
880 " 🔵 HIGH Blocker Resolution Pattern: Explicit Fixes Across All 6 Plans
881 " 🔵 Three-Surface Parity Implementation: Shared tRPC Service Layer (D-84)
882 " 🔵 Methodology Gating Pattern: Scrum/Kanban/None Adapts All Surfaces Consistently
883 " 🔵 Task Hierarchy Implementation: Four-Level Type System with Parent Pointers

Access 613k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
