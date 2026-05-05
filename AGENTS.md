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

# [fulcrum] recent context, 2026-05-05 3:18am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,499t read) | 241,023t work | 92% savings

### May 5, 2026
638 2:28a 🔵 Detailed test failures reveal specific dispatchRun integration gaps across all surfaces
639 " ✅ dispatchRun tRPC mutation committed to phase-03 branch
640 2:29a ✅ Added dispatchRun method to SymphonyCaller CLI interface
641 " ✅ CLI help text updated with runs dispatch command documentation
642 " ✅ Added dispatch case to cmdRuns command router
643 " 🟣 Implemented cmdRunsDispatch CLI command handler
644 " ✅ Updated stubCaller to include dispatchRun stub implementation
645 " 🟣 Added dispatch server action to Web orchestration page
646 2:30a ✅ Added dispatch method to TUI OrchestrationScreen caller interface
647 " 🟣 Implemented dispatch method in TUI OrchestrationScreen class
648 " 🔵 Symphony conformance tests show significant progress: 78 pass, 2 fail (down from 73/7)
649 2:31a 🔵 Remaining 2 test failures are both tRPC-specific implementation issues
650 " 🔵 tRPC dispatchRun endpoint encounters database execution error (PGLite)
651 2:32a 🔵 tRPC dispatchRun fails database check constraint: agent_runs_sandbox_mode_check rejects "noSandbox"
652 " 🔵 Schema mismatch: dispatchRun uses "noSandbox" but constraint requires "host"|"docker"|"podman"
653 " 🔴 Fixed sandboxMode database constraint violation in dispatchRun tRPC mutation
654 2:33a 🔴 Refined sandboxMode fix: persist database-valid value instead of API name
655 " 🔵 Symphony conformance tests: 80/80 PASSING — dispatchRun fully integrated and validated
656 " ✅ Phase 3 dispatchRun integration committed: CLI, TUI, Web surfaces unified on SND-06
657 " 🔵 Post-commit validation: symphony conformance tests remain 80/80 passing
658 2:34a 🔵 Orchestration router unit tests: 8/8 passing — tRPC dispatchRun validated
659 " 🔵 CLI symphony module tests: 17/17 passing — dispatch command implementation validated
660 " 🔵 Web orchestration page server tests: 4/4 passing — dispatch form action validated
661 " 🔵 TypeScript type checking errors in CI: dispatchRun interface incompatibility
662 " 🔴 Fixed TypeScript type errors in HTTP server nullability
664 2:40a 🔵 CI pipeline web:check task crashes with SIGABRT abort signal
665 2:51a 🔴 Resolved TypeScript errors in symphony orchestration and http-server
666 " 🟣 Phase 03-06 HTTP extension and dispatch parity completed with 4 auto-fixed bugs
667 2:52a ⚖️ Phase 03-06 complete and ready for verification; Phase 03 fully delivered
668 " ✅ Phase 03 symphony-sandcastle marked COMPLETE in STATE.md with architectural decisions recorded
669 2:58a 🔵 Symphony Phase 3 Conformance Requirements (SYM-09 through SYM-19)
670 " 🔵 Lifecycle Hooks Implementation and Retry Mechanics in Symphony
671 " 🔵 Lifecycle Hook Interface Definition and Agent Communication
672 " 🔵 Symphony Dispatch Flow and Workspace Path Validation
673 " 🔵 SYM-19 Stall Detection: lastCodexTimestamp Preference and Fallback Logic
674 2:59a 🔵 Workflow Definition Schema Supports after_create Hook
675 " 🔵 SYM-12 and Workspace Lifecycle Hooks from OpenAI Symphony SPEC
676 " 🔵 SYM-12 Workspace CWD Enforcement in app-server-client and Dispatch State Machine
677 " 🔵 Dispatch Integration in Web and TUI Orchestration Interfaces
678 " 🔵 Official SYM-12 and SYM-13 Requirements from REQUIREMENTS.md
679 " 🔵 SYM-12 Path Validation Gap: assertWorkspacePathInOrgRoot Called Only During Cleanup, Not Before Launch
680 3:00a 🔵 Phase 3 Completion Status and SYM-09 through SYM-13, SYM-19 Requirements
681 " 🔵 Phase 3 Success Criteria and SYM Requirement Mapping
682 " 🔵 Conformance Test Coverage Map for SYM-09 through SYM-19
683 " 🔵 Phase 3 Verification Report Generated: 31/33 SYM Requirements Verified, 2 Blockers Identified
684 3:02a 🔵 Phase 3 Verification Agent Completed: 2 Specific Implementation Gaps Confirmed
S142 Complete Area 6 checkpoint and initiate Area 7 (Three-surface routing UX) Question 1/4 — finalize skill sync decisions, then begin discussion on routing config CRUD parity across Web/CLI/TUI. (May 5 at 3:10 AM)
687 3:10a 🟣 Symphony Orchestration: SYM-09 through SYM-13 + SYM-19 implementation complete
S143 Progress Area 7 (Three-surface routing UX) Question 2/4 — determine route testing/preview UX: explainable result detail, simple result, or debug-only detail with verbose flag. (May 5 at 3:10 AM)
S144 Progress Area 7 (Three-surface routing UX) Question 3/4 — determine rule authoring model: structured builder with JSON escape hatch, raw JSON only, or natural language generation. (May 5 at 3:10 AM)
S145 Complete Area 7 (Three-surface routing UX) Question 4/4 — determine rule validation gate before save: strict validation with dry-run, save disabled draft, or save anything with late disabling. (May 5 at 3:11 AM)
688 3:11a 🔵 All orchestration tests pass: 196/196 across 8 test files
689 " 🔵 SYM-12 + SYM-13 implementation verification via code inspection
S147 Phase 4 Discussion Completion: Capture all 7 gray areas (Inference, Embedding, Router Learning, LLM Gate, MCP, Skill Sync, Surface UX) with locked decisions across 28 Q&A pairs (May 5 at 3:11 AM)
S146 Phase 03 gap closure: verify and complete remaining Symphony Orchestration (SYM) requirements — specifically SYM-12 (workspace safety), SYM-13 (lifecycle hooks), and related items. (May 5 at 3:11 AM)
S148 Complete Phase 03 verification: confirm all 33 Symphony + Sandcastle conformance requirements met, with specific focus on closing SYM-12 (workspace safety) and SYM-13 (lifecycle hooks) gaps. (May 5 at 3:11 AM)
690 3:12a 🔵 SYM-12 + SYM-13 implementation verified with line-by-line evidence
S149 Phase 4 discussion completion and context documentation: 7 areas with 28 locked decisions ready for downstream planning agents (May 5 at 3:13 AM)
S150 Phase 4 Context Documentation: Complete discussion-to-documentation transition for Inference + Router/Skills phase with all 28 locked decisions (May 5 at 3:14 AM)
S151 Continue Phase 4 planning without asking questions; transition from discussion phase (complete) to planning phase. System background operations detected AI-SPEC gate for Phase 4 (Inference + Router/Skills) (May 5 at 3:15 AM)
**Investigated**: • Plan-phase workflow documentation (steps 1-15+) loaded and examined
    • Phase 4 initialization queried: found=true, has_context=true, has_research=false, has_plans=false
    • UI brand patterns and project instructions reviewed
    • Phase 4 scope: 04-CONTEXT.md exists with 28 locked decisions across 7 discussion areas
    • AI-SPEC gate (step 4.5) triggered: Phase 4 contains AI/inference keywords (detected from phase goal/scope)
    • Init config: planner_model=opus, researcher_model=sonnet, checker_model=sonnet, commit_docs=true

**Learned**: • Phase 4 discussion is complete with canonical CONTEXT.md and DISCUSSION-LOG.md committed (hash 6db5635f)
    • All 28 locked decisions (D-01 through D-28) organized into 7 decision areas with implementation details
    • Plan-phase workflow includes non-blocking AI-SPEC gate: detects AI keywords, suggests running gsd-ai-integration-phase for framework/eval strategy
    • Gate is non-blocking — planning can proceed with existing CONTEXT.md; AI-SPEC would be optional enrichment
    • System workflows support chunked planning mode, validation strategy (Nyquist), security threat model gate, UI design contract gate, schema push detection

**Completed**: • Phase 4 discussion phase: 100% complete with CONTEXT.md and DISCUSSION-LOG.md
    • Phase directory prepared: .planning/phases/04-inference-router-skills/
    • State.md confirms 3/3 phases ready
    • System loaded plan-phase workflow templates and UI brand patterns
    • Skill invocation attempt (gsd-plan-phase) failed (skill not registered); system is reading workflows in preparation for orchestrator-style invocation

**Next Steps**: System has arrived at AI-SPEC gate (step 4.5 of plan-phase workflow). Gate decision pending:
    Option 1: **Continue without AI-SPEC** — proceed to research/planning phases using existing CONTEXT.md (non-blocking path)
    Option 2: **Stop and run gsd-ai-integration-phase 4 first** — generate AI-SPEC (framework selection, eval strategy) before planning
    
    Current recommendation: Option 1 (continue). Rationale: All architectural decisions locked in CONTEXT.md; AI-SPEC would add eval design but core design is captured; non-blocking gate allows proceeding. Next action: confirm decision, then transition to research phase (step 5 of plan-phase workflow).


Access 241k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
