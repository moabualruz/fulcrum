---
title: "Project alignment and gap workflow"
type: plan
status: completed
date: 2026-04-21
origin: "User request to reinitialize Fulcrum goals/aims/values/parts/integrations from docs, find plan-code drift, then turn the process into reusable skills."
---

# Project Alignment and Gap Workflow

This records the docs-to-gap workflow after five passes plus the granular
feature-acceptance correction. It captures the repeatable method, current
alignment, gaps found, gaps closed, and reusable skills created from the
workflow.

## Inputs

- Full docs inventory: `docs/reference/2026-04-21-doc-inventory.md`
- Fourth-pass implementation audit: `docs/reference/2026-04-21-fourth-pass-implementation-drift-audit.md`
- Fifth-pass subagent orchestration audit: `docs/reference/2026-04-21-fifth-pass-subagent-orchestration-audit.md`
- Coordination source: `docs/plans/MASTER-PLAN.md`
- Shipped memory source: `docs/architecture/memory-v3.md` and `docs/plans/2026-04-18-002-memory-tiered-architecture-progress.md`
- Agent integration source: `docs/plans/2026-04-19-004-agent-parity-plan.md`, `docs/plans/2026-04-19-004-agent-parity-progress.md`, and `docs/reference/2026-04-20-integration-completeness-checklist.md`
- Historical backlog: `docs/audit/**`, `docs/history/**`, `docs/plans/plan-*.md`
- Code truth: source files, package manifests, tests, and CLI/action outputs

## Source-of-Truth Order

1. Code and tests define shipped behavior.
2. Progress ledgers define what a plan actually shipped.
3. Checklist/reference docs define explicit remaining rows when backed by verifier commands.
4. Architecture and guide docs define operator-facing promises.
5. `MASTER-PLAN.md` defines intended coordination state, but only after it is reconciled with ledgers.
6. Audit/history docs define candidate backlog, not current truth, until re-verified against code.

## Reinitialized Project Definition

### Goal

Fulcrum is a local-first agent operating system and control plane. It keeps multi-agent work governed by durable state, policy, memory, worktrees, workflows, teams, install surfaces, and verifiable runtime adapters.

### Aim

Make every supported agent runtime act through Fulcrum before it improvises: recall before search, policy before execution, task/run state before work, verified install state before claiming integration, and tested code before status flips.

### Values

- Local-first operation: SQLite, vault files, and local CLI control first.
- Agent-native parity: any human action should have a CLI/MCP/hook path an agent can use.
- Auditability: plans, progress ledgers, checklists, tests, and source evidence must agree.
- Native integration: each agent uses its own plugin/extension/rules standard where available.
- Role safety: role boundaries, WIP, merge rights, and direct-write restrictions stay enforced.
- Memory integrity: L0 raw first, L1 curated, L2 async; no raw truncation disguised as truth.
- No silent deferral: every open row remains open until explicitly completed or explicitly descoped.
- Test-first closure: no gap moves to done without a reproducer, verifier, or compliance test.

### Parts

| Part | Current role |
|---|---|
| `packages/core` | IDs, roles, tasks, runs, DB schema, events, locks, telemetry, handoffs |
| `packages/memory` | L0/L1/L2 memory, vault, curator, recall, Kuzu, lifecycle, stats |
| `packages/policy` | system invariants, policy evaluation, secret scanning, audit |
| `packages/cli` | CLI, MCP tools, action registry, hooks, install commands, TUI |
| `packages/worker` | adapter registry and run spawning |
| `packages/workflows` | workflow definition and runner |
| `packages/teams` | team templates and instances |
| `packages/worktrees` | worktree allocation, review, merge queue |
| `packages/planning` | PRDs, epics, issues, plans, review workflows |
| `packages/monitor` | HTTP/SSE dashboard and read-only metrics |
| `packages/sync` | Plane/external sync and conflict handling |
| `packages/agent-fanout` | canonical skill/rule parsing and per-agent artifact emission |
| `agent-integration` | runtime-specific plugin, hook, skill, rule, installer, publish artifacts |
| `docs` | planning memory, audit backlog, operator guides, progress ledgers |

### Integrations

- Agent hosts: Claude Code, Codex CLI, Gemini CLI, opencode, PI cockpit, Copilot CLI, Cursor, Windsurf.
- Extension modes: Claude plugin/marketplace, Codex plugin/marketplace, Gemini extension, opencode npm plugin, PI npm cockpit, rules/files for Copilot/Cursor/Windsurf.
- Data systems: SQLite WAL/FTS5, sqlite-vec, Kuzu, git-backed vault files.
- External surfaces: Plane sync, npm publish, OTel export, MCP servers/tools.

## Current Track State

| Track | Current read |
|---|---|
| Memory v3 | Complete per progress ledger PR 9, `docs/architecture/memory-v3.md`, and reconciled `MASTER-PLAN.md`. |
| Agent parity / install standardization | PR 17 complete per progress ledger; checklist still has two open operator publish rows and two partial cross-cutting rows. |
| Worktrees v2 | Draft / approval-pending per `MASTER-PLAN.md`. |
| Install TUI dashboard | Active but unaudited per `MASTER-PLAN.md`. |
| Indexer daemon refactor | Likely shipped but not archived; needs shipped-vs-plan diff. |
| Domain plans | `plan-architecture`, `plan-mcp`, `plan-plugins`, `plan-rag`, and `plan-skills-agents` need triage or retirement. |

## Drift and Gaps

### Addressed in This Pass

1. `MASTER-PLAN.md` now marks Memory v3 completed, registers Agent Parity / install standardization, and adds the Agent Parity progress/checklist artifacts.
2. `README.md` package names now match package manifests and include `fulcrum-agent-fanout`.
3. `README.md` now says 32 MCP tools and avoids a static test-count badge.
4. `docs/reference/2026-04-20-integration-completeness-checklist.md` now says Codex + opencode consume fanout in `agent-integration/install.ts`.
5. `AGENTS.md` and stale tool-registry comments no longer hard-code old public-tool and test counts.
6. `docs/plans/2026-04-19-004-agent-parity-plan.md` frontmatter now says `status: active-closeout`.
7. `packages/cli/src/index.ts`, `docs/guides/architecture.md`, and `docs/architecture/memory-v3.md` no longer carry old MCP/package-count strings.
8. `scripts/fanout-pi-cockpit.ts` restored the repo-root `AGENTS.md` managed block expected by PI compliance.

### Addressed in Second Pass

1. `docs/reference/2026-04-21-doc-inventory.md` was refreshed after this workflow added two docs; live count is now 144.
2. `docs/guides/mcp-tools.md` and `docs/guides/architecture.md` now use the verified 32-tool MCP catalog count.
3. `docs/guides/architecture.md` no longer hard-codes a package-local test count.
4. `docs/reference/2026-04-19-pi-cockpit-extension-surface.md` now reflects the shipped PI cockpit surface: 11 native PI tools, not a full mirror of all 32 MCP tools.
5. Current guides now use package-manifest names: `fulcrum-agent-core` and `fulcrum-agent-cli`.
6. `docs/reference/2026-04-20-integration-completeness-checklist.md` and the active agent-parity plan now consistently use 33 canonical skills, with `roles/` treated as a role catalog rather than a skill.
7. opencode install-mode docs now match code: `auto`, `native`, and `manual`; verify output reports `native` / `manual` / `unknown`.
8. `agent-integration/install.ts` comments now use the shipped install-mode vocabulary.
9. `packages/agent-fanout/src/index.ts` exported `VERSION` now matches `packages/agent-fanout/package.json` (`0.0.3`), closing the root-suite scaffolding failure.
10. Copilot hook artifacts now target a supported dispatcher path: `copilot` is a first-class `HookCli`, normalizes the Claude-compatible tool event shape, and is covered by config-integrity plus hook-normalization tests.

### Addressed in Third Pass

1. Local workflow skills were enriched with routed reviewer/auditor gates: `document-review`, `ce:review` / `code-review-and-quality`, `agent-native-audit`, `cli-agent-readiness-reviewer`, `architecture-strategist`, `data-integrity-guardian`, `security-sentinel`, `performance-oracle`, and `skill-creator`.
2. `MASTER-PLAN.md` MCP namespace count now matches `packages/cli/src/mcp-tools.ts`: 32 shipped tools.
3. `docs/architecture/install-paths.md` now uses the shipped opencode manual-mode vocabulary.
4. `docs/reference/2026-04-20-integration-completeness-checklist.md` no longer carries a stale static CLI test-count claim.
5. `docs/plans/2026-04-19-004-agent-parity-plan.md` now keeps opencode install modes on `{auto, native, manual}` and avoids pre-v3 mode vocabulary.
6. CLI hook dispatch now accepts emitted `--event` hook config forms for Copilot, Cursor, and Windsurf. This closes the third-pass CLI-readiness finding where installed hook commands like `fulcrum hook copilot --event pre_tool_use` previously exited with `Unknown hook phase`.
7. `scripts/config-integrity.test.ts` now validates `--event` names instead of ignoring flag-based hook commands.
8. Copilot compliance now includes a regression proving emitted `--event` hook commands dispatch without unknown-phase errors.

### Third-Pass Reviewer Coverage

| Surface | Focused skill coverage | Result |
|---|---|---|
| Alignment and plan docs | `document-review` personas: coherence, feasibility, product, scope, adversarial | Found stale current-doc claims; fixed the verifier-backed rows above. |
| CLI/hooks/install | `cli-agent-readiness-reviewer`, `kieran-typescript-reviewer`, `project-standards-reviewer` | Found unsupported `--event` dispatch for shipped hook configs; fixed and tested. |
| Agent-native parity | `agent-native-audit`, `agent-native-reviewer` | Confirmed hook-command action parity improved for Copilot/Cursor/Windsurf; remaining PI/Codex Fulcrum-first rows stay partial. |
| Architecture/API | `architecture-strategist`, `api-contract-reviewer` | Hook event-name mapping is confined to CLI dispatcher/config-integrity; no package-boundary change beyond existing `HookCli` union. |
| Data/security/performance | `data-integrity-guardian`, `security-sentinel`, `performance-oracle` | No schema, secret, auth, or hot-path changes in this pass. |
| Skill authoring | `skill-creator` | Kept routing in existing SKILL.md bodies; no extra reference files added. |

Verification note: stale-phrase scan still matches historical handover/progress
documents (`memory v2a`, old one-time test totals, and manual-fallback history).
Treat those as archival context unless they appear in active guides, current
plans, or reference/checklist rows.

### Addressed in Fourth Pass

1. Added three local workflow skills:
   `subsystem-implementation-drift-auditor`,
   `integration-utilization-auditor`, and `full-project-gap-fixer`.
2. Updated the existing workflow skills so full passes now require
   alignment-to-code contracts, package-by-package implementation audit,
   integration/utilization audit, verifier-backed fixing, and focused re-review.
3. Added a fourth-pass audit report at
   `docs/reference/2026-04-21-fourth-pass-implementation-drift-audit.md`.
4. Scoped verifier-backed task-by-ID surfaces where workspace context already
   exists: CLI `tasks get`, internal `get_task`, `start_agent_run` task lookup,
   `startAgentRun`, workflow `wait_for_task`, task blocker hydration, run
   escalation, and memory `project_context`.
5. Added focused regressions for cross-workspace blocker hydration,
   cross-workspace `wait_for_task`, and `start_agent_run.context_type` MCP
   schema handling.
6. Added `context_type` to the `start_agent_run` MCP schema and updated active
   lifecycle docs/generated context guidance.
7. Corrected current active docs for policy invariant count, supported hook
   CLIs, built-in L1 roles, install/runtime coverage, local-first network
   wording, and package-owned process spawning.
8. Replaced `packages/worktrees/src/index.ts` wildcard exports with explicit
   exports.

### Fourth-Pass Reviewer Coverage

| Surface | Focused skill coverage | Result |
|---|---|---|
| Subsystem contracts | `subsystem-implementation-drift-auditor`, `repo-research-analyst`, `architecture-strategist` | All package groups received an explicit docs-to-code contract in the fourth-pass report. |
| Integration/utilization | `integration-utilization-auditor`, `agent-native-audit`, `cli-agent-readiness-reviewer` | Producer/consumer pairs were audited for core, policy, memory, fanout, worker/workflows/teams/worktrees, and docs/checklists. |
| Code fixes | `full-project-gap-fixer`, `ce:review`, correctness/testing/maintainability/project-standards reviewers | Closed only bounded verifier-backed code gaps; left strict task API migration open because it needs a dedicated compatibility plan. |
| Docs and skill authoring | `document-review`, `skill-creator` | Updated active docs and local skill bodies without adding extra reference scaffolding beyond the fourth-pass audit report. |

### Fourth-Pass Verification

Static gates passed: `git diff --check`, canonical docs inventory compare,
stale active-doc phrase scan, package wildcard export scan, and CLI help probes.

Targeted gates passed: core runs/task-labels, workflows runner, CLI MCP/hooks/
install/tool registry, memory project-context, fanout, scripts config-integrity,
worktrees, policy, and planning package tests.

Broad gates passed: `pnpm test`, `pnpm build`, and `pnpm run check:cycles`.

### Addressed in Fifth Pass

1. Added three local workflow skills:
   `subagent-orchestrated-project-pass`,
   `focused-subagent-task-packet`, and `subagent-result-integrator`.
2. Updated the seven docs-to-gap workflow skills so broad passes now build a
   lane graph, issue bounded subagent packets, require research-gate status,
   enforce forbidden scope, require per-lane self-checks, and merge results
   through a verifier ledger.
3. Added a fifth-pass audit report at
   `docs/reference/2026-04-21-fifth-pass-subagent-orchestration-audit.md`.
4. Preserved real Fulcrum delegation as the default when `delegate-task`,
   `spawn-agent`, or `team-launch` is available and policy/WIP permit; defined
   packet-emulated subagents as the fallback when the current agent runtime does
   not expose a real subagent tool.
5. Kept large remaining code gaps open as fix-plan packets rather than
   opportunistic fixes: strict task workspace scoping API migration and full
   installer fanout consumption both need dedicated verifier-first lanes.
6. Reran the fifth pass against docs and code after adding the orchestration
   layer. The run covered 146 docs and broad source scans across `packages`,
   `agent-integration`, and `scripts`.
7. Fixed active memory-v3 doc drift in `AGENTS.md`,
   `agent-integration/claude/CLAUDE.md`, and `MASTER-PLAN.md`: Memory v3 is
   shipped/live and `FULCRUM_MEMORY_V3` is retired.
8. Reconfirmed strict task workspace scoping remains open across `updateTask`,
   planning relations, task-outcome synthesis, and task-memory recall paths.
9. Reconfirmed installer fanout consumption remains partial: Codex and
   opencode use fanout emitters, while other installers still need dedicated
   migration lanes.
10. Reconfirmed Fulcrum-first bias remains partial for Codex and PI runtime
    surfaces, requiring runtime-specific verifier-first packets.
11. Hardened the fifth-pass skills after the actual run: future passes now
    reject setup-only completion, require lane coverage evidence, distinguish
    active from historical docs, and avoid naive count greps.

### Fifth-Pass Reviewer Coverage

| Surface | Focused skill coverage | Result |
|---|---|---|
| Skill authoring | `skill-creator`, `project-standards-reviewer` | New skills stay concise, single-purpose, and avoid auxiliary docs. |
| Agent orchestration | `agent-native-audit`, `architecture-strategist` | Main-agent control plus specialist lanes matches Fulcrum control-plane goals. |
| Workflow reliability | `correctness-reviewer`, `testing-reviewer`, `maintainability-reviewer` | Each lane now needs source paths, verifier evidence, self-check, and next-step gate. |
| Docs/plans | `document-review` personas | Active memory-v3 stale docs were fixed; historical stale claims were left as archival. |
| Data/security | `data-integrity-guardian`, `security-sentinel` | Strict task workspace scoping debt remains open and verifier-first. |
| CLI/install | `cli-agent-readiness-reviewer`, `kieran-typescript-reviewer`, `project-standards-reviewer` | Fanout consumption remains partial and needs a migration packet. |
| Agent parity | `agent-native-audit`, `agent-native-reviewer` | Codex/PI Fulcrum-first bias remains partial and needs runtime-specific packets. |

### Fifth-Pass Verification

Verification is recorded in the fifth-pass report. The actual rerun changed
skills and docs only, so no code fix lane was accepted. Broad test/build/cycle
checks remain required after any later code-facing fix lane changes shared
surfaces.

### Post-Fifth Correction: Granular Acceptance Freeze

The workflow still missed a concrete feature question: whether the web view is
implemented as described across the project docs. Root cause: prior passes
audited subsystems and integrations, but did not force active feature tracks to
explode into smallest-unit requirement rows. A feature could stay under
`active`, `needs audit`, or `future work` without route/control/runtime/browser
proof.

Correction applied:

1. Added `granular-feature-acceptance-auditor`.
2. Updated the full-pass orchestrator so feature acceptance runs before
   subsystem audit, integration audit, and fixing.
3. Added a no-new-plan freeze: do not add new plans or ideas until prior
   requested/active work has requirement rows and evidence.
4. Added a parent closure rule: no feature is complete until every child row is
   accepted, blocked externally, blocked by decision, or explicitly descoped.
5. Added a web/UI gate: promised browser surfaces need route, code, data,
   integration, test/check, and browser/runtime proof. Source grep alone is not
   enough.

This turns the user complaint into a workflow invariant: the next project pass
must start with feature acceptance rows for all prior asked-for work, including
the web view, before creating new plans.

### Remaining Coordination Drift

1. Historical brainstorm/ideation/audit/handover docs still mention older package, tool, memory, and test-count states. Leave as history unless a future docs policy says to annotate old planning docs.
2. Strict task workspace scoping is partially enforced on external/workflow
   surfaces. A full public API migration is still open for `updateTask`,
   planning task relations, and task-outcome synthesis.

### Agent Integration Gaps

From `docs/reference/2026-04-20-integration-completeness-checklist.md`:

| Gap | Status |
|---|---|
| Publish `@fulcrum-agent-os/opencode-plugin` | Open operator step |
| Publish `@fulcrum-agent-os/pi-cockpit` | Open operator step |
| Installer consumes fanout output for every agent | Partial |
| Fulcrum-first bias wired for every hook-capable agent | Partial |

Checklist evidence was refreshed in this pass: the installer fanout row now names Codex + opencode as fanout consumers. The row remains partial until the remaining installers stop relying on committed templates or native source trees directly.

### Plan Backlog Needing Triage

`MASTER-PLAN.md` marks these as unresolved or contested:

- `2026-04-16-memory-v2a-plan.md`
- `2026-04-16-memory-v2b-plan.md`
- `2026-04-16-plugin-install-operator-surfaces-plan.md`
- `2026-04-18-001-refactor-indexer-daemon-plan.md`
- `docs/plans/plan-architecture.md`
- `docs/plans/plan-mcp.md`
- `docs/plans/plan-plugins.md`
- `docs/plans/plan-rag.md`
- `docs/plans/plan-skills-agents.md`

## Repeatable Workflow

### Phase 1: Inventory

1. Generate canonical docs list with `find docs -type f | sort`.
2. Count docs by top-level section.
3. Classify each doc as source, progress, reference, guide, audit, history, handover, or stale candidate.

Skill candidate: `project-doc-inventory`.

### Phase 2: Reinitialize Alignment

1. Read docs in this order: root README, `docs/README.md`, `MASTER-PLAN.md`, active progress ledgers, architecture docs, integration checklists, audit/history docs.
2. Extract goal, aim, values, parts, integrations, active tracks, completed tracks, prior user-requested features, and open questions.
3. Resolve contradictions using the source-of-truth order above.
4. Run document-review-style checks for coherence, feasibility, product/scope fit, and adversarial failure modes.
5. Emit a concise alignment sheet with evidence paths, drift notes, reviewer coverage, and a seed table for feature acceptance rows.

Skill candidate: `project-alignment-reinitializer`.

### Phase 3: Granular Feature Acceptance Gate

1. Pause new plans, architecture ideas, and speculative improvements.
2. Use `granular-feature-acceptance-auditor` to turn every prior request and
   active track into requirement rows.
3. Decompose project -> track -> feature -> capability -> smallest unit:
   UI control/state, CLI command, MCP/action call, hook event, installer path,
   package export, integration path, and verifier.
4. For web views and browser surfaces, require runtime proof with browser
   testing or an explicit runtime blocker.
5. Mark parent features complete only when every child row is accepted, blocked,
   or descoped.

Skill candidate: `granular-feature-acceptance-auditor`.

### Phase 4: Review Drift and Gaps

1. Turn plans/checklists into verifiable claims.
2. Route each claim through focused skills before accepting it:
   - prior requests, active tracks, feature completion: `granular-feature-acceptance-auditor`
   - web views/browser UI: `granular-feature-acceptance-auditor`, `frontend-design`, `frontend-ui-engineering`, `browser-testing-with-devtools` or `agent-browser`
   - docs/plans/reports: `document-review`
   - CLI/MCP/hooks/install: `cli-agent-readiness-reviewer`, `kieran-typescript-reviewer`, `project-standards-reviewer`
   - agent parity/skills/workflows: `agent-native-audit`, `agent-native-reviewer`, `skill-creator`
   - architecture/package boundaries: `architecture-strategist`, `api-contract-reviewer`
   - memory/schema/policy: `data-integrity-guardian`, `security-sentinel`
   - async/performance: `reliability-reviewer`, `performance-oracle`
3. Run each claim against code using grep, tests, package manifests, CLI actions, or docs.
4. Classify each mismatch:
   - `doc-stale`: code shipped, docs lag.
   - `code-gap`: docs promise behavior code lacks.
   - `plan-stale`: plan status wrong versus progress ledger.
   - `runtime-unverified`: browser/runtime behavior lacks proof.
   - `feature-incomplete`: parent feature has open, missing, or undecomposed child rows.
   - `operator-gap`: code ready, external operator action remains.
   - `needs-human-decision`: conflicting goals or explicit open question.
5. Rank by blast radius and dependency order.

Skill candidate: `plan-code-drift-reviewer`.

### Phase 5: Subsystem Implementation Audit

1. Use `subsystem-implementation-drift-auditor` to audit every package group:
   core, memory, policy, CLI/MCP/hooks/install, fanout/integration, worker,
   workflows, teams, worktrees, planning, monitor, sync, and docs.
2. For each subsystem, compare docs/plans promises to code, tests, public
   exports, package manifests, generated artifacts, hooks, and compliance tests.
3. Record reviewer source per finding. Always include correctness, testing,
   maintainability, and project standards; add TypeScript, CLI readiness,
   architecture/API, data integrity, security, reliability, performance, and
   agent-native reviewers as triggered.

Skill candidate: `subsystem-implementation-drift-auditor`.

### Phase 6: Integration and Utilization Audit

1. Use `integration-utilization-auditor` to audit producer/consumer pairs:
   core -> downstream packages, policy -> CLI/hooks, memory -> CLI/MCP/hooks,
   fanout -> agent integration, worker/workflows/teams/worktrees -> run
   lifecycle, and docs/checklists -> verifiers.
2. Distinguish code gaps, docs gaps, operator gaps, and product decisions.
3. Do not mark external publish rows or ambiguous human choices complete.

Skill candidate: `integration-utilization-auditor`.

### Phase 7: Address Gaps

1. Pick one verifier-backed child requirement row or one gap group with a single owner package.
2. Pick focused reviewer/auditor coverage for the surface.
3. Write or update the verifier first.
4. Fix code or docs.
5. Run targeted tests, then broader tests if shared surfaces changed.
6. Run root tests after shared package metadata, hook routing, or integration config changes; narrow package tests are not enough to catch cross-package config drift.
7. Update progress/checklist/master docs in the same logical change.
8. Record why if a gap is descoped; no silent deferrals.
9. Re-run the granular acceptance auditor for the parent feature before status changes.

Skill candidate: `gap-report-closer`.

### Phase 8: End-to-End Docs-to-Closure Workflow

1. Run inventory.
2. Reinitialize alignment.
3. Produce alignment-to-code contracts and feature acceptance seed rows.
4. Run granular feature acceptance.
5. Run subsystem implementation audit.
6. Run integration/utilization audit.
7. Close verifier-backed gaps in dependency order using `full-project-gap-fixer`.
8. Re-run focused reviewers and update the report/checklist.
9. Re-run holistic verification.
10. Create or refresh skills only after the steps produce repeatable reviewer-routed results.

Skill candidate: `docs-to-alignment-gap-workflow`.

### Phase 9: Subagent-Orchestrated Full Pass

1. Use `subagent-orchestrated-project-pass` when scope is broad, parallelism
   helps, or context encapsulation is needed.
2. Use `focused-subagent-task-packet` for every lane: alignment,
   feature-acceptance, subsystem audit, integration audit, fix-plan, fix, and
   re-review.
3. Keep main agent as control plane for source order, ledger, merge decisions,
   and final report.
4. Prefer real Fulcrum delegation/team/workflow tools when available and
   policy/WIP permit; otherwise run packet-emulated subagents sequentially.
5. Require internet/current-doc research before fix plans or implementation
   plans that depend on external tools, protocols, publish processes, or
   libraries.
6. Use `subagent-result-integrator` to deduplicate findings, rank severity,
   attach verifiers, create next packets, and block unsupported status flips.

Skill candidate: `subagent-orchestrated-project-pass`.

## Immediate Next Work

1. Run granular feature acceptance over all prior requested and active tracks,
   starting with the web view / install TUI dashboard question.
2. Do not add new plans or ideas until that ledger exists and all rows are
   accepted, blocked, or descoped.
3. Decide whether operator publish steps should stay open rows in the integration checklist or move to a release checklist.
4. Address the remaining partial integration rows: full installer fanout consumption and Fulcrum-first bias across all hook-capable agents, starting with Codex and PI runtime-specific packets.
5. Plan the remaining strict task workspace scoping API migration for
   `updateTask`, planning task relations, and task-outcome synthesis.
6. After the next gap-closure group, run the reviewer-routed workflow again before promoting `docs-to-alignment-gap-workflow` beyond local skill form.
