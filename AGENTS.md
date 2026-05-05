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

# [fulcrum] recent context, 2026-05-05 10:18am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (35,257t read) | 1,136,585t work | 97% savings

### May 5, 2026
S171 Continue Phase 5 (Task Management + Metrics) context enhancement; rewrite CONTEXT.md with competitive research and validated library selections. User identified three issues with the approach: deleted vs updated decisions, removed code context, overly aggressive deferred list. (May 5 at 7:47 AM)
S172 Finalize Phase 5 Task Management + Metrics CONTEXT.md planning document by promoting 7 high-value scope features from deferred to in-scope, consolidating 111+ architectural decisions, and verifying persistent file state. (May 5 at 7:58 AM)
S173 Continue observing Phase 5 (Task Management + Metrics) primary session as it moves from research completion into planning/implementation phases. Document entity schema decisions, service layer design, tRPC router implementations, and component architecture. (May 5 at 8:00 AM)
769 8:20a 🔵 Phase 5 Task Management + Metrics comprehensive research completed and committed
770 8:21a 🔵 Phase 5 deep-research agent completed comprehensive codebase analysis and gap assessment
771 8:25a 🟣 Phase 05 UI Design Contract Generated
S174 gsd-plan-phase 5 — Initialize Phase 5 (task-management-metrics) planning with context, research, and validation documents (May 5 at 8:32 AM)
776 8:34a 🔵 Phase 5 (task-management-metrics) initialization state and gate status
777 8:35a ✅ Phase 5 VALIDATION.md document created with test infrastructure and task verification map
S175 Revise Phase 05 planning documents to resolve blocker and warning issues identified by the plan checker (5 blockers, 4 warnings) (May 5 at 8:36 AM)
778 8:37a 🔵 Task entity missing six columns required by Phase 5 and existing code
779 " 🔵 MetricsCache entity schema incomplete for two-layer analytics architecture
780 " 🔵 Architectural antipatterns in service layer: inline DDL and raw SQL mutations
781 " 🔵 WorkerRegistry in-process pattern confirmed; graphile-worker not installed
782 " 🔵 Event emission and tRPC delegation patterns established and proven
783 8:54a ⚖️ Phase 05 Plans 09-10: Chart Dashboard & Timeline Infrastructure Architecture
784 8:56a ⚖️ Plan 11: Filtering, Bulk Operations, and Custom Field Verification Architecture
785 8:57a ⚖️ Plan 12: Keyboard-First UX with tinykeys and Field Dependency Rules
786 8:58a ⚖️ Plan 13: Real-Time Collaboration, Portfolio Dashboard, and Complete Chart Suite
787 8:59a ⚖️ Plan 14: Three-Surface Parity via CLI Reports, TUI ASCII Charts, and Shared tRPC
788 9:00a ⚖️ Plan 15: Final Sprint/Workflow/Automation UI and Phase 05 Completion Checkpoint
789 9:09a ⚖️ Two-layer analytics architecture for task metrics—design and implementation plan
790 9:10a ⚖️ Sprint management extensions and event-driven automation engine—design and implementation plan
791 9:13a ⚖️ Board and list UI components for competitive task management—design and implementation plan
792 9:14a ⚖️ Reports visualization layer with LayerChart components and tRPC migration—design and implementation plan
793 9:16a ⚖️ Gantt and calendar timeline views with critical path analysis—design and implementation plan
794 9:17a ⚖️ Filter builder, saved views, bulk operations, and custom field verification—design and implementation plan
795 9:18a ⚖️ Real-time collaboration with Yjs, y-websocket server, portfolio dashboard, and remaining analytics charts—design and implementation plan
796 9:20a ⚖️ Phase 05 final components and CI verification gate—closing plan for task management and metrics
S176 Continue Phase 5 planning from context compaction. Complete comprehensive audit of Phase 3/4 implementation gaps that affect Phase 5 task management. Write consolidated Phase 5 plan based on research and gap findings. (May 5 at 9:22 AM)
798 9:25a ✅ Phase 4 Milestone Completed
S177 Peer review Phase 5 planning artifacts (15 plans, 111 decisions, 5 waves) for the Fulcrum Task Management + Metrics project; synthesize findings into structured review document (May 5 at 9:26 AM)
799 9:32a ⚖️ Established deep research workflow before implementation decisions
800 " ⚖️ Research outputs must persist to disk files, not conversation-only memory
801 " ⚖️ Implementation decisions require specificity and competitive parity, not generic descriptions
802 " ⚖️ Phase research must include codebase-specific integration mapping
803 9:33a ✅ Codified research and decision-making rules into project governance
804 9:34a 🔵 Confirmed multi-persona peer review tool and Phase 5 artifacts ready
805 " 🔵 Phase 5 planning artifacts systematically reviewed with decision coverage gaps discovered
806 9:35a 🔵 Phase 5 peer review drilling into plan-by-plan task breakdown and acceptance criteria
807 9:37a 🔵 Phase 5 peer review completed with NO-GO verdict and 18 actionable findings
808 " 🔵 Phase 5 Peer Review Identifies 18 Critical Planning Gaps and Architectural Conflicts
S178 Peer review Phase 5 planning artifacts (Task Management + Metrics) with comprehensive quality gates; also distribute research enforcement rules to all agent platforms; capture Phase 3/4 gap audit findings (May 5 at 9:39 AM)
809 9:39a 🔵 Phase 5 Peer Review Complete: Full Analysis Delivered with NO-GO Verdict and 18 Findings
810 9:44a ✅ Phase 5 Peer Review Document Successfully Written to Disk
811 " ✅ Agent Behavioral Rules Updated to Enforce Deep Research and Integration Documentation
812 9:45a ✅ Deep Research Behavioral Rules Successfully Distributed to All Agent Platforms
S179 Clarify whether Gemini uses GEMINI.md, AGENTS.md, or both for configuration/documentation (May 5 at 9:46 AM)
813 9:55a 🔵 GEMINI.md references AGENTS.md for documentation
S180 Peer-review Phase 5 planning artifacts (Task Management + Metrics) for the Fulcrum project, reading all 15 plan files plus context/research/gap audit, and writing findings to 05-REVIEWS.md with focus on executability, dependency correctness, decision coverage, architectural risks, and wave parallelism. (May 5 at 9:55 AM)
814 9:57a 🔵 Phase 5 peer review identifies 6 blocking HIGH-severity issues and comprehensive feature scope
815 10:00a ✅ Phase 5 Plan 01 refined with consolidated migration tasks and blocking issue resolutions
816 10:02a ✅ Phase 5 Plan 02 updated to include YjsSnapshot entity (HIGH-05 fix) and consolidate tasks
817 10:03a ✅ Phase 5 Plan 03 refactored to remove HIGH-06 same-file conflict; adds D-100 team mention resolution
818 10:09a ⚖️ Phase 5 Plan 10: Gantt/Calendar architecture refactored to extract critical path algorithm
819 10:11a ⚖️ Phase 5 Plan 11: Filter and bulk actions consolidated under tasks domain; custom field types increased to 9
820 " ⚖️ Phase 5 Plan 12: Keyboard shortcuts extracted to pure module; field dependencies split client/server; components reorganized
821 10:12a ⚖️ Phase 5 Plan 13: Yjs server extracted with auth/persistence; portfolio dashboard and analytics simplified to 4 key charts
822 10:13a ⚖️ Phase 5 Plan 14: CLI and TUI scope simplified; task-relate extracted; ASCII chart component isolated
823 10:14a ⚖️ Phase 5 Plan 15: Final completion plan dramatically scoped down; autonomous execution with deferred UAT

Access 1137k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
