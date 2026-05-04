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

# [fulcrum] recent context, 2026-05-04 10:52pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,350t read) | 589,254t work | 97% savings

### May 4, 2026
S71 Verify Phase 2 ("02-bug-fixes-foundation") completion status and investigate blocking issues preventing CI gate pass after extensive infrastructure implementation across 8 interdependent plans. (May 4 at 3:34 PM)
S72 Why Phase 2 cannot be completed - investigation of CI blockers preventing phase gate approval (May 4 at 3:50 PM)
S73 Phase 2 completion blocker resolution strategy - shifting from phase execution to focused debug/fix loop (May 4 at 9:07 PM)
S74 Execute phase 2 ($gsd-execute-phase 2) - awaiting primary session action (May 4 at 9:08 PM)
S75 Fix Phase 2 completion blockers: resolve MikroORM EntityManager migration issues, fix public API parity 404s, add @playwright/test, and verify graphile-worker bootstrap so `bun run ci` passes (May 4 at 9:13 PM)
455 9:37p ✅ Complete test suite validation: 1000+ tests passing across all subsystems and CLI tools
456 " ✅ Added `updated_at` audit timestamp to sprints table schema
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
S76 Continue observing Phase 2 ("Bug Fixes + Foundation") execution and completion, capturing verification evidence and governance artifact updates to memory for searchable reference. (May 4 at 10:05 PM)
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
S77 Verify that BUG-17 (repo hygiene) deferral is consistently documented across Phase 2 artifacts and understand the scope boundary between product/runtime execution versus repository maintenance. (May 4 at 10:46 PM)
S78 Complete memory agent observation of Phase 2 Bug Fixes + Foundation execution, verification, and formal closure; document all deferral decisions and governance artifact updates for searchable reference. (May 4 at 10:46 PM)
S79 Correct Phase 2 branch-policy context after accidental main push; ensure future execution stays on dev/v1.0 until final milestone merge (May 4 at 10:52 PM)
S80 Observe and document Phase 2 ("Bug Fixes + Foundation") execution completion, including code commits, dev/v1.0 synchronization, and formal verification closure (May 4 at 10:50 PM)
**Investigated**: - Phase 2 implementation execution completion and commit state
    - Commit 72256736 with 62 files changed across database, services, web, CLI, tests, governance layers
    - Database schema evolution from accounts (OAuth token) table to events (verb/payload/subject_kind) table
    - Governance artifact updates: STATE.md, ROADMAP.md, VERIFICATION.md, VALIDATION.md, 02-CONTEXT.md, 02-08-SUMMARY.md
    - Repository synchronization state: origin/dev/v1.0...dev/v1.0 parity verification
    - Branch-policy correction: phase execution stays on dev/v1.0; main updates only through final milestone merge after all phases land
    - Phase completeness formal verification: 8 plans, 8 summaries, zero errors/warnings

**Learned**: - Amendment-based commit strategy successfully consolidated Phase 2 work: initial commit 28a12e94 amended to 72256736 with database snapshot included
    - Database architecture shifted from OAuth token storage (access_token, refresh_token, id_token, password, provider_id fields) to event-based model (verb, payload, subject_kind, subject_id fields)
    - org_id constraint changed from nullable to mandatory (NOT NULL), reflecting organizational requirement strengthening
    - Repository synchronization achieved parity for dev/v1.0: `git rev-list --left-right --count origin/dev/v1.0...dev/v1.0` returns 0 0
    - Formal governance verification confirms 8/8 observable truths, 9/9 required artifacts, 5/5 key links wired—zero structural gaps
    - Correct BUG-17 scope: local-main sync is milestone merge hygiene, not per-phase execution; loaded context must preserve this policy

**Completed**: - Phase 2 full execution: 8/8 plans completed (02-01 through 02-08)
    - 24/24 in-scope Phase 2 requirements satisfied; BUG-17 tracked as branch-policy/milestone merge hygiene
    - Commit 72256736 "fix(phase-2): complete foundation execution" created with:
      * 62 files changed: 1468 insertions(+), 230 deletions(-)
      * 4 new files created (debug guide, verification report, orchestration lib, theme module)
      * Database snapshot reflecting accounts→events schema migration (+10804/-1031 net lines)
    - Push to origin/dev/v1.0: 24043242..72256736 synchronized successfully
    - Branch-policy context added to execute-phase workflow loader, .planning/STATE.md, and Phase 2 CONTEXT/VERIFICATION/SUMMARY artifacts
    - Formal verification closure: phase-completeness tool confirms complete=true with zero errors

**Next Steps**: - Phase 2 formally closed and synchronized on dev/v1.0
    - System ready for Phase 3 (Symphony + Sandcastle orchestration) execution planning
    - Awaiting user direction to initiate Phase 3 work
    - Future GSD phase execution must not push or mutate main unless user explicitly requests it in the same turn


Access 589k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
