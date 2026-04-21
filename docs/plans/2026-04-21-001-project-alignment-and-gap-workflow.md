---
title: "Project alignment and gap workflow"
type: plan
status: active
date: 2026-04-21
origin: "User request to reinitialize Fulcrum goals/aims/values/parts/integrations from docs, find plan-code drift, then turn the process into reusable skills."
---

# Project Alignment and Gap Workflow

This records the docs-to-gap workflow after five passes plus the granular
feature-acceptance correction and seventh-pass closure loop. The workflow is
active with the full-project unit ledger closed to accepted rows. Targeted
fixes landed, release blockers were reduced and closed, and remaining publish
automation auth is documented as an ops credential note rather than a code
ledger blocker.

## Inputs

- Full docs inventory: `docs/reference/2026-04-21-doc-inventory.md`
- Fourth-pass implementation audit: `docs/reference/2026-04-21-fourth-pass-implementation-drift-audit.md`
- Fifth-pass subagent orchestration audit: `docs/reference/2026-04-21-fifth-pass-subagent-orchestration-audit.md`
- Sixth-pass granular surface ledger: `docs/reference/2026-04-21-sixth-pass-granular-surface-ledger.md`
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
- No silent deferral: any newly found row stays non-terminal until explicitly completed, blocked, or descoped.
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
| Agent parity / install standardization | PR 17 complete per progress ledger; release/publish work remains explicit operator blockers, while cross-cutting install/runtime rows are tracked in the sixth/seventh-pass ledgers. |
| Worktrees v2 | Draft; blocked-decision pending approval per `MASTER-PLAN.md`. |
| Install TUI dashboard | Active but unaudited per `MASTER-PLAN.md`. |
| Indexer daemon refactor | Likely shipped but blocked-decision until shipped-vs-plan diff/archive choice lands. |
| Domain plans | `plan-architecture`, `plan-mcp`, `plan-plugins`, `plan-rag`, and `plan-skills-agents` are blocked-decision until audit/retire choice lands. |

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
| Agent-native parity | `agent-native-audit`, `agent-native-reviewer` | Confirmed hook-command action parity improved for Copilot/Cursor/Windsurf; PI/Codex Fulcrum-first runtime gaps were later fixed in the sixth-pass reopen. |
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
5. At the fifth-pass checkpoint, kept large remaining code gaps open as
   fix-plan packets rather than opportunistic fixes: strict task workspace
   scoping API migration and full installer fanout consumption both needed
   dedicated verifier-first lanes.
6. Reran the fifth pass against docs and code after adding the orchestration
   layer. The run covered 146 docs and broad source scans across `packages`,
   `agent-integration`, and `scripts`.
7. Fixed active memory-v3 doc drift in `AGENTS.md`,
   `agent-integration/claude/CLAUDE.md`, and `MASTER-PLAN.md`: Memory v3 is
   shipped/live and `FULCRUM_MEMORY_V3` is retired.
8. At that point, strict task workspace scoping remained open across
   `updateTask`, planning relations, task-outcome synthesis, and task-memory
   recall paths. The sixth pass closed the `updateTask` row; remaining scoped
   API work is planning relations and task-outcome synthesis.
9. At that point, installer fanout consumption was not fully wired. The sixth
   pass closed generated installer artifact fanout for Cursor, Windsurf, and
   Copilot; host-native plugin/package surfaces stay separate rows.
10. Reconfirmed Fulcrum-first bias was incomplete for Codex and PI runtime
    surfaces. The reopened sixth pass fixed PI's `before_agent_start` nudge
    and Codex's `PermissionRequest` search-nudge path.
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
| Data/security | `data-integrity-guardian`, `security-sentinel` | Fifth-pass output treated strict task workspace scoping as verifier-first backlog; later rows record the closures and remaining scoped follow-ups. |
| CLI/install | `cli-agent-readiness-reviewer`, `kieran-typescript-reviewer`, `project-standards-reviewer` | Fifth-pass output treated fanout consumption as a migration packet; later rows record generated installer and host-runtime verification. |
| Agent parity | `agent-native-audit`, `agent-native-reviewer` | PI cockpit Fulcrum-first nudge and Codex PermissionRequest search nudge are fixed in the sixth-pass reopen. |

### Fifth-Pass Verification

Verification is recorded in the fifth-pass report. The actual rerun changed
skills and docs only, so no code fix lane was accepted. Broad test/build/cycle
checks remain required after any later code-facing fix lane changes shared
surfaces.

### Sixth-Pass Targeted Lane

The sixth pass started from clean checkpoint commit `c9edebf`
(`chore: checkpoint alignment workflow passes`) to isolate workflow results
from prior work. It did not complete a full project pass. It completed one
targeted web-monitor lane plus static/broad verification. The later
sixth/seventh-pass ledger loop supplied the missing enumeration for packages,
commands, tools, routes, controls, hooks, installers, generated artifacts,
integration pairs, and verifier rows.

Primary lesson: granular feature acceptance must test behavior contracts, not
implementation presence. The web monitor existed, but two child rows were still
wrong or under-verified:

| Finding | Drift type | Reviewer source | Verifier | Status |
|---|---|---|---|---|
| `POST /runs/:id/kill` promised operator kill/abort behavior but returned and persisted `blocked`. | code gap / behavior drift | granular feature acceptance, correctness, CLI/web control contract | `packages/monitor/src/tests/write-endpoints.test.ts`; runtime `curl POST /runs/:id/kill` | fixed |
| SSE replay emitted only `event_type`/`event_id` while live/browser code consumes `evt_type`/`evt_id`. Resumed event streams could render as blank/unknown even though live streams worked. | integration gap / consumer-contract drift | integration utilization, browser/web gate, reliability | `packages/monitor/src/tests/sse-bridge.test.ts`; runtime `Last-Event-ID` SSE replay probe | fixed |

Code changes:

1. Added `abortAgentRun()` to `packages/core/src/runs.ts` and exported it.
2. Made abort emit first-class `agent_run_aborted` events.
3. Updated monitor kill endpoint to call the core run lifecycle API instead of
   marking runs blocked.
4. Normalized SSE chunks so live, DB replay, and poll paths expose both
   canonical and compatibility fields: `evt_type`, `event_type`, `evt_id`,
   `event_id`, `ts`, and `created_at`.
5. Updated the web event log to display `agent_run_aborted` distinctly.

Runtime proof:

- Browser screenshot: `/tmp/fulcrum-sixth-pass-dashboard.png`
- Board probe showed backlog/active/blocked/done counts: `1/1/1/1`.
- Agent probe showed a running `software_engineer` and blocked `qa_engineer`.
- Kill probe returned `{ "status": "aborted" }`.
- Agent probe after kill showed the run as `status: "aborted"` and
  `status_category: "done"`.
- SSE replay probe showed `agent_run_aborted` with both `evt_type` and
  `event_type`, proving browser/TUI parser compatibility.

Skill improvements from the run:

1. `granular-feature-acceptance-auditor` now requires a behavior-contract
   matrix: trigger, payload, persisted state, response shape, replay/retry
   shape, consumer parse, and negative path.
2. `docs-to-alignment-gap-workflow` now requires each action/control/stream to
   verify behavior contracts during feature acceptance.
3. `subagent-orchestrated-project-pass` now treats a user-exposed unverified
   child row as proof the pass was too coarse.
4. `full-project-gap-fixer` now requires persisted-state evidence for control
   actions and live/replay/retry contract parity for streaming/generated
   outputs.

### Sixth-Pass Targeted-Lane Verification

Focused verifiers passed:

- `pnpm -F fulcrum-agent-core test -- runs`
- `pnpm -F fulcrum-monitor test -- write-endpoints sse-bridge`
- Browser screenshot through Playwright CLI
- Runtime HTTP probes for `/board`, `/agents`, `/pm/overview`, `/runs/:id/kill`,
  and `/events/stream` replay

Static gates passed:

- `git diff --check`
- canonical docs inventory compare against `find docs -type f | sort`
- active-doc stale phrase scan, with remaining hits classified as current
  expected wording, example text, or historical/operator-publish context
- package guard scan for role-string comparisons, bare `ulid()`, wildcard
  exports, and simple unscoped task lookup patterns

Targeted gates passed:

- `pnpm -F fulcrum-agent-core test -- runs`
- `pnpm -F fulcrum-monitor test -- write-endpoints sse-bridge`
- `pnpm -F fulcrum-agent-cli test`
- `pnpm -F fulcrum-agent-fanout test`
- `pnpm --dir scripts test -- config-integrity`
- `pnpm -F fulcrum-monitor test`

Broad gates passed:

- `pnpm test`
- `pnpm build`
- `pnpm run check:cycles`

Correction after user review: this section is not proof that the full app is
granularly aligned. It is proof that one targeted monitor lane was fixed and
that the repository still passed broad checks afterward. A real full pass must
produce a complete unit inventory and acceptance ledger across every subsystem
before any whole-project completion claim.

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
2. Strict task workspace scoping is now enforced for `updateTask` and the
   touched CLI/monitor/CoS call sites. Remaining scoped API migration is still
   open for planning task relations and task-outcome synthesis.

### Agent Integration Gaps

From `docs/reference/2026-04-20-integration-completeness-checklist.md`:

| Gap | Status |
|---|---|
| Publish `@fulcrum-agent-os/opencode-plugin` | Open operator step |
| Publish `@fulcrum-agent-os/pi-cockpit` | Open operator step |
| Installer consumes fanout output for every agent | Superseded by sixth/seventh-pass unit ledger |
| Fulcrum-first bias wired for every hook-capable agent | Superseded by sixth/seventh-pass unit ledger |

Checklist evidence was refreshed in this pass: the installer fanout row names
Codex + opencode as fanout consumers, and the Fulcrum-first row records
PI/Codex runtime fixes. The later host-runtime lane verified
Cursor/Windsurf/Copilot read/search/MCP hook coverage and trusted-session
runtime bias for generated hook paths. The sixth/seventh-pass JSON ledger now
tracks host-native plugin/package surfaces, per-event rows, and per-artifact
rows as accepted or explicit terminal blockers.

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
   - `runtime-needs-proof`: browser/runtime behavior lacks proof.
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

1. Continue granular feature acceptance over the remaining prior requested and
   active tracks after the reopened sixth-pass audit below.
2. Do not add new plans or ideas until those ledgers exist and all rows are
   accepted, blocked, or descoped.
3. Decide whether operator publish steps should stay open rows in the integration checklist or move to a release checklist.
4. Build per-host event/runtime ledgers for Cursor, Windsurf, and Copilot:
   generated config, dispatcher event, documented payload shape, session
   lifecycle, runtime bias/control effect, and negative paths.
5. Plan the remaining strict task workspace scoping API migration for
   planning task relations and task-outcome synthesis.
6. After the next gap-closure group, run the reviewer-routed workflow again before promoting `docs-to-alignment-gap-workflow` beyond local skill form.

## Sixth-Pass Reopened: Granular Full-System Audit Ledger

User correction was valid: the earlier sixth-pass result only proved a targeted
monitor lane. The pass is reopened as a full-system unit audit. Broad checks
passing is not treated as completion; each package, command/tool/route/control,
generated artifact, and producer/consumer pair needs its own evidence.

### Snapshot

- Checkpoint commit before the pass: `c9edebf chore: checkpoint alignment workflow passes`.
- Docs inventory: 147 files; current inventory file still matches
  `find docs -type f | sort`.
- Project inventory: 17 workspace project roots including the root workspace,
  packages, scripts, opencode plugin, and PI cockpit.
- Agent host inventory: Claude, Codex, Gemini, opencode, PI, Copilot, Cursor,
  and Windsurf.
- Public surface inventory:
  - 32 MCP schemas in `packages/cli/src/mcp-tools.ts`.
  - 39 tool/action registry entries in `packages/cli/src/tool-registry.ts`.
  - 43 CLI dispatch tokens including aliases and top-level controls in `packages/cli/src/index.ts`.
  - 40 monitor HTTP routes in `packages/monitor/src/server.ts`.
  - 29 workflow step types in `packages/workflows/src/types.ts`.
  - 8 fanout targets in `packages/agent-fanout/src/types.ts`.
  - 17 installer functions in `agent-integration/install.ts`.
  - 10 native opencode tools in `agent-integration/opencode/plugins/fulcrum.ts`.
  - 11 native PI cockpit tools in `agent-integration/pi/cockpit/index.ts`.

### Project Lane Coverage

This table is lane coverage, not acceptance. A row here means the lane was
named and sampled or fixed; it does not mean every unit in the lane is done.
The full granular ledger is
`docs/reference/2026-04-21-sixth-pass-granular-surface-ledger.md`.

| Project | Source files | Tests | Public exports | Sixth-pass audit state |
|---|---:|---:|---:|---|
| `fulcrum` root workspace | n/a | n/a | n/a | root scripts/dependency workspace inventoried; script-level rows now terminal in the JSON ledger |
| `fulcrum-agent-core` | 89 | 45 | 59 | runs/tasks/events scanned; `updateTask` is now workspace-scoped |
| `fulcrum-memory` | 263 | 139 | 139 | v3 docs and stubs scanned; PI/Anthropic curator and consolidation apply remain explicit non-complete rows |
| `fulcrum-policy` | 10 | 5 | 5 | system invariants/code tests scanned; no high-confidence code gap found in this pass |
| `fulcrum-agent-cli` | 104 | 73 | 41 | command groups, TUI, log, hooks, install shell scanned; log, TUI, and generated installer feature rows fixed with focused verifiers |
| `fulcrum-monitor` | 22 | 12 | 4 | all routes and web controls inventoried; control, pagination, auth-doc, and web-create project gaps fixed |
| `fulcrum-agent-fanout` | 29 | 13 | 21 | emitters and installer utilization scanned; generated installer artifacts now prove equality to fanout output |
| `fulcrum-mcp` | 2 | 1 | 0 | zero-install wrapper scanned; no high-confidence code gap found in this pass |
| `fulcrum-planning` | 16 | 8 | 7 | review lifecycle scanned; monitor bypasses planning update API for reviews |
| `fulcrum-sync` | 10 | 2 | 6 | conflict resolution scanned; `remote_wins` now requires and verifies local apply callback before resolution |
| `fulcrum-teams` | 10 | 4 | 8 | team caps, heartbeat, status tests scanned; no high-confidence code gap found in this pass |
| `fulcrum-worker` | 12 | 4 | 7 | adapter lifecycle scanned; built-in adapter docs refreshed |
| `fulcrum-workflows` | 12 | 3 | 8 | handler inventory scanned; `call_mcp_tool` guide now matches failing/no-MCP behavior |
| `fulcrum-worktrees` | 6 | 1 | 6 | allocation/merge lifecycle scanned; allocation event/span claim fixed |
| `agent-integration/opencode` | 2 | 4 | n/a | native plugin tool/event surfaces inventoried; per-tool acceptance still open |
| `agent-integration/pi/cockpit` | 1 | 1 | n/a | native PI cockpit tools/events inventoried; per-tool and per-event acceptance still open |
| `scripts` | n/a | 3 | n/a | config-integrity and surface-inventory guards run; scripts remain support-surface, not feature acceptance |

### Accepted Findings

| ID | Subsystem | Claim | Observed state | Drift/gap type | Reviewer source | Verifier | Severity | Owner lane | Status |
|---|---|---|---|---|---|---|---|---|---|
| MON-001 | monitor control API | `docs/guides/monitor.md` lists `POST /runs`, `/runs/:id/heartbeat`, `/runs/:id/complete`, `/runs/:id/block`, `/memory/recall`, `/memory/write`, and `/cos-context`. | Route handlers and tests now cover the documented control endpoints. | code gap | granular feature acceptance, API contract, CLI readiness | `packages/monitor/src/tests/write-endpoints.test.ts`; `pnpm -F fulcrum-monitor test -- write-endpoints` | P1 | monitor | fixed |
| PI-001 | PI cockpit monitor consumer | PI cockpit native commands/tools should consume monitor route responses without silent empty lists or missing IDs. | `/tasks` and `/workspaces` return `{ data, pagination }` / `{ data }`, while PI expected legacy `{ tasks }` / `{ workspaces }`; create-task expected a top-level `task_id` while monitor returns `{ data: task }`. PI now unwraps both current and legacy envelopes, and the surface guard diffs PI route calls against monitor route registrations. | integration gap / consumer parse | integration utilization, agent-native, CLI readiness | `agent-integration/pi/cockpit/tests/cockpit.test.ts`; `scripts/surface-inventory.test.ts`; `pnpm --dir agent-integration/pi/cockpit test`; `pnpm --dir scripts test -- surface-inventory` | P1 | PI/monitor | fixed |
| PI-002 | PI cockpit Fulcrum-first bias | Package docs claimed a Fulcrum-first bias nudge, including `before_provider_request` / `before_agent_start`. | Current PI docs show `before_agent_start` is the stable system-prompt mutation point; `before_provider_request` replaces provider-specific payloads and is mainly for debug. Cockpit now injects a Fulcrum-first nudge through `before_agent_start`, keeps `before_provider_request` observational, and updates package docs accordingly. | code/doc drift | agent-native, PI docs via Context7/local package docs, reliability | `agent-integration/pi/cockpit/tests/cockpit.test.ts`; `pnpm --dir agent-integration/pi/cockpit test` | P2 | PI cockpit | fixed |
| CODEX-001 | Codex Fulcrum-first bias | Prior reports treated static rider injection as enough while also saying runtime search-before-recall bias was incomplete. | Codex PreToolUse is Bash-only, so search-tool bias now rides the all-tool `PermissionRequest` path. Search requests emit advisory Fulcrum-first stderr plus telemetry without blocking; recall requests record real `recall_called`; UserPromptSubmit now logs `turn_observed`, not fake recall. | integration/runtime gap | agent-native, CLI readiness, Codex docs via Context7/local reference, testing | `packages/cli/src/tests/hook-codex-pr6.test.ts`; `pnpm -F fulcrum-agent-cli test -- hook-codex-pr6` | P2 | Codex/CLI hooks | fixed |
| HOSTDOC-001 | Cursor/Windsurf install docs | Active rules and install guides still said hook-based features were unavailable for Cursor/Windsurf or named old config paths. | Cursor/Windsurf templates and guides now match shipped `.cursor/hooks.json`, `.windsurf/hooks.json`, `.windsurf/mcp.json`, `.codex/config.toml`, and `.opencode/opencode.jsonc` surfaces. Surface inventory now guards these active-doc claims. | current-doc/runtime drift | document-review, integration utilization, project standards | `scripts/surface-inventory.test.ts`; `pnpm --dir scripts test -- surface-inventory` | P2 | host docs/install | fixed |
| HOSTHOOK-001 | Cursor/Windsurf/Copilot hook runtime | Prior host rows checked config and dispatcher parity, but did not prove read/search/MCP events reached runtime bias paths or that session lifecycle created trusted run state. | Cursor and Copilot hook configs now include read/search/MCP matchers. Cursor `session_start` creates a task-backed run and returns `CURSOR_SESSION_ID`/`FULCRUM_SESSION_ID` env so documented `preToolUse` payloads without `session_id` still resolve trusted run state. Copilot `session_start` creates trusted session files. Windsurf actual `agent_action_name`/`tool_info` payloads normalize for read/run/MCP, and `pre_user_prompt` bootstraps trusted session state by `trajectory_id` so `pre_read_code` can emit Fulcrum-first bias. | runtime/integration gap | CLI readiness, agent-native, integration utilization, project standards | `packages/cli/src/tests/hook-host-runtime.test.ts`; `packages/cli/src/tests/hook-normalization.test.ts`; `pnpm -F fulcrum-agent-cli test -- hook-host-runtime hook-normalization` | P1 | host hooks/CLI | fixed-targeted |
| OC-001 | opencode event integration | `todo.updated` mirroring should exercise the real opencode event wrapper and update scoped Fulcrum task state. | The verifier still used the old top-level `todo` payload while plugin code reads `event.properties.todos`. The test now matches the SDK wrapper shape, and mirrored `update_task` calls include workspace/project IDs from `getContext()`. | test gap / integration hardening | agent-native, integration utilization, correctness | `agent-integration/opencode/plugins/tests/event-subscriptions.test.ts`; `pnpm --dir agent-integration/opencode test` | P2 | opencode plugin | fixed |
| MON-002 | monitor run lifecycle | Unblock should resume a blocked run as a first-class lifecycle operation. | `/runs/:id/unblock` now delegates to `unblockAgentRun()`, updating status category, version, run event journal, projection, and domain event. | code gap / persisted-state drift | correctness, data integrity, reliability | core lifecycle test plus monitor endpoint assertions for status category, run event/domain event, and projection | P1 | monitor/core | fixed |
| MON-003 | monitor list API | `/tasks`, `/agents`, `/artifacts`, `/memory-trace`, and `/teams` support `?limit=N&cursor=OFFSET`, max 200, and return pagination. | All five endpoints now use shared pagination, accept `cursor`/`offset`, cap limit at 200, and return pagination metadata. | code/docs drift | API contract, document-review | `packages/monitor/src/tests/pagination-contract.test.ts` | P2 | monitor | fixed |
| MON-004 | monitor auth | Current guide says write endpoints require bearer when `FULCRUM_MONITOR_TOKEN` is set. | Guide now matches code: bearer auth is enforced when `FULCRUM_MONITOR_REQUIRE_AUTH=1`; loopback local mode remains unauthenticated by default. | current-doc stale | security, document-review | `docs/guides/monitor.md` update plus existing bearer-token tests | P2 | monitor/docs | fixed |
| WEB-001 | web dashboard | Web quick action create task fills workspace/project from context. | `/status` exposes `project_id`, CLI monitor launch passes cwd-derived project context, and the browser form includes project_id in task creation. | integration gap | frontend/UI, data integrity | `packages/monitor/src/tests/write-endpoints.test.ts` default project_id assertions | P1 | monitor web | fixed |
| TUI-001 | cockpit TUI | Requirements require no polling, detail view, task done action, policy violations, task titles, heartbeat lag, assigned role, age, and workspace name. | TUI now streams via SSE without a data polling interval, exposes selected-item detail, wires `d` to `PATCH /tasks/:id` completed, shows policy violations plus blocked runs, includes task title/assigned role/age, agent heartbeat lag/task title, and reads workspace/project display names from `/status`. | feature gap | granular feature acceptance, CLI readiness, frontend/UI, Ink docs via Context7 | `packages/cli/src/tests/tui-contract.test.ts`; `packages/monitor/src/tests/write-endpoints.test.ts`; `pnpm --dir packages/cli exec vitest run src/tests/tui-contract.test.ts`; `pnpm --dir packages/monitor exec vitest run src/tests/write-endpoints.test.ts` | P1 | CLI TUI | fixed |
| LOG-001 | CLI log | `fulcrum log --run-id` filters a single run and can fall back to DB polling. | DB paths queried `events.run_id`, but `events` has no `run_id` column; hook events were not read in non-follow DB output. | code gap | correctness, CLI readiness | `packages/cli/src/tests/log.test.ts`; `pnpm -F fulcrum-agent-cli test -- log` | P1 | CLI log | fixed |
| CORE-001 | task domain | Task-by-ID queries must include workspace scope. | `updateTask()` now requires `workspace_id`; core, CLI, tool registry, monitor, and CoS parser call sites pass explicit workspace scope. | security/data gap | data integrity, security, project standards | cross-workspace update test plus core/CLI/monitor focused suites | P1 | core/CLI | fixed |
| WF-001 | workflow MCP step | Workflow guide previously said `call_mcp_tool` returned no-op success. | Guide now matches handler/test behavior: no MCP connection returns failed with actionable error. | docs/code drift | agent-native, reliability, document-review | `packages/workflows/src/tests/runner.test.ts -- call_mcp_tool` plus guide update | P2 | workflows/docs | fixed |
| WT-001 | worktrees | Worktrees guide claims allocation emits `worktree_allocated` event and `worktree.allocate` span. | `allocateWorktree()` now emits the allocation event and closes a `worktree.allocate` span on success/error where trace tables exist. | code/docs drift | architecture, reliability | `packages/worktrees/src/tests/worktrees.test.ts`; `pnpm -F fulcrum-worktrees test -- worktrees` | P2 | worktrees | fixed |
| SYNC-001 | sync conflict resolution | `remote_wins` applies the Plane version locally. | `resolveConflict()` now requires an `apply_remote_data` callback or manager-level apply callback, pulls and maps the remote object, invokes local apply, and only then records resolution and synced state. Missing/failed apply leaves the conflict unresolved. | code gap | data integrity, integration utilization | `packages/sync/src/tests/sync.test.ts`; `pnpm -F fulcrum-sync test -- sync` | P1 | sync | fixed |
| FAN-001 | agent fanout/install | Fanout output should be the canonical producer for generated installer artifacts. | `installCursor()`, `installWindsurf()`, and `installCopilot()` now write current `parseCanonicalSource()` + emitter output for generated rules/instructions. Codex and opencode already consumed fanout; host-native plugin/package trees remain separate installer surfaces. | integration gap | agent-native audit, integration utilization | `packages/cli/src/tests/install-fanout-utilization.test.ts`; `pnpm --dir packages/cli exec vitest run src/tests/install-fanout-utilization.test.ts`; `pnpm -F fulcrum-agent-fanout test` | P2 | fanout/install | fixed |
| STD-001 | package boundary/process ownership | Agent guide says runtime agent spawning belongs in `@fulcrum/worker` while package-owned OS subprocesses need explicit ownership. | `AGENTS.md` now distinguishes runtime agent execution from installer probes, git worktrees, desktop notifications, index helpers, workflow command steps, and explicitly configured curator backends. A source guard now fails on new `child_process` imports outside reviewed owner files. | standards conflict | project standards, architecture | `packages/core/src/tests/child-process-boundary-guard.test.ts`; `pnpm -F fulcrum-agent-core test -- child-process-boundary` | P1 | standards/architecture | fixed |
| INV-001 | full surface inventory | A full pass must cover all packages, plugins, extensions, callable surfaces, and installer surfaces before claiming coverage. | Added a granular surface ledger naming 17 workspace project roots, 13 public package entrypoints, 8 agent host integrations, 38 host sentinel artifacts, 42 CLI dispatch tokens, 32 MCP schemas, 39 registry tools, 40 monitor routes, 29 workflow step types, 8 fanout targets, 17 installer functions, 10 opencode native tools, and 11 PI native tools. | process/test gap | granular feature acceptance, project standards | `scripts/surface-inventory.test.ts`; `pnpm --dir scripts test -- surface-inventory` | P1 | workflow/reporting | fixed-inventory-only |
| INV-002 | unit acceptance ledger | Count-level inventory still let the pass look broad while skipping package internals, package tests, manifest scripts, package exports, and plugin/extension events/artifacts as individual rows. | Added `docs/reference/2026-04-21-sixth-pass-unit-acceptance-ledger.json` with 2,769 explicit open rows: 17 workspace projects, 277 package source files, 311 package test files, 37 package configs, 37 generated package artifacts, 15 script sources, 72 package manifest scripts, 13 public entrypoints, 883 exports, 42 CLI tokens, 8 fanout targets, 32 MCP schemas, 39 registry tools, 40 monitor routes, 29 workflow steps, 17 installers, 10 opencode native tools, 11 PI native tools, 790 agent-integration artifacts, 54 host hook config events, 14 PI events, 13 PI commands, and 8 opencode plugin hooks. The guard now fails if any discovered unit lacks a row. | process/test gap | granular feature acceptance, project standards | `scripts/surface-inventory.test.ts`; `pnpm --dir scripts test -- surface-inventory` | P1 | workflow/reporting | fixed-row-coverage-only |
| PIEXT-001 | PI extension manifest | Package manifests that declare `pi.extensions[]` must point at real extension files. | Root `package.json` advertised stale `./packages/extension/index.ts`, which does not exist. Removed the stale root PI package declaration; actual PI package entry remains `agent-integration/pi/cockpit/package.json` -> `./index.ts`. Added a guard that checks every package manifest `pi.extensions[]` target resolves. | plugin/extension manifest gap | integration utilization, project standards, PI docs via Context7/local docs | `scripts/surface-inventory.test.ts`; `pnpm --dir scripts test -- surface-inventory` | P1 | plugins/extensions | fixed |
| MEM-001 | memory v3 | Memory guide presents curator backends and consolidation path. | PI curator backend and consolidation apply are explicit future slots in code/CLI help; Anthropic is available only through registered backend/provider paths and credentials. These rows are terminal blockers/future capability, not complete shipped behavior. | blocked/future capability | data integrity, document-review | `packages/memory/src/tests/l1-curator-backend-pi.test.ts`; consolidation dry-run tests; active docs/help wording | P2 | memory/docs | blocked-decision |
| WORKER-001 | worker adapters | Worker docs should reflect built-in adapter set. | Worker guide now lists `stub`, `subprocess`, and `claude-code` as built-in adapters. | docs drift | architecture, document-review | `docs/guides/worker-adapters.md` update plus worker adapter tests from prior pass | P3 | worker/docs | fixed |

### Remaining Packets

1. `memory-shipped-state`: PI curator and consolidation apply stay
   blocked/future until verifier-backed implementations land.
2. `per-host-event-runtime-ledger`: Cursor, Windsurf, and Copilot now have
   targeted read/search bias coverage, but each host still needs rows for
   every emitted event, tool class, generated artifact, negative path, and
   install/update path before the plugin/extension lane can close.
3. `strict-task-workspace-scoping-follow-up`: planning relations and
   task-outcome synthesis still need scoped API migration.
4. `per-unit-row-closure`: the machine-readable unit ledger now exists, but
   rows are not accepted until each has verifier evidence, reviewer source,
   and final status.

### Sixth-Pass Verification

- `pnpm -F fulcrum-monitor test -- write-endpoints pagination-contract` passed after route, project-context, pagination, and unblock lifecycle fixes.
- `pnpm -F fulcrum-agent-core test -- tasks` passed after making `updateTask()` workspace-scoped.
- `pnpm -F fulcrum-agent-core build` passed so dependent packages use updated core dist.
- `pnpm -F fulcrum-worktrees test -- worktrees` passed after allocation event/span instrumentation.
- `pnpm -F fulcrum-sync test -- sync` passed after `remote_wins` local apply callback enforcement.
- `pnpm --dir packages/cli exec vitest run src/tests/tui-contract.test.ts` passed after TUI unit-contract fixes.
- `pnpm --dir packages/monitor exec vitest run src/tests/write-endpoints.test.ts` passed after `/status` gained workspace/project names.
- `pnpm -F fulcrum-agent-cli test -- tool-registry mcp-tools task` passed after workspace-scoped task update callers.
- `pnpm -F fulcrum-agent-cli test -- log` passed after adding log-specific coverage for run-id filtering through `events.object_id`/payload and `hook_events.run_id`.
- `pnpm --dir packages/cli exec vitest run src/tests/install-fanout-utilization.test.ts` passed after Cursor, Windsurf, and Copilot generated installer artifacts were tied to current fanout emitter output.
- `pnpm -F fulcrum-agent-fanout test` passed after the fanout installer utilization fix.
- `pnpm -F fulcrum-agent-core test -- child-process-boundary` passed after adding the process-boundary allowlist guard.
- `pnpm --dir scripts test -- config-integrity` passed after generated config/install changes.
- `pnpm --dir scripts test -- surface-inventory` passed after adding the
  granular surface ledger guard, monitor docs/PI route-consumer parity check,
  host integration doc/config drift guard, root workspace package coverage,
  public package entrypoint coverage, CLI dispatch token coverage, fanout target
  coverage, host sentinel artifact coverage, PI extension manifest path
  validation, package source/test/config/generated file rows, manifest script
  rows, host hook event rows, PI extension event/command rows, opencode plugin
  hook rows, 2,769 explicit unit row coverage, and stale Windsurf duplicate
  removal.
- `pnpm -F fulcrum-agent-cli test -- hook-codex-pr6` passed after adding
  Codex PermissionRequest search-nudge and honest `turn_observed` telemetry.
- `pnpm --dir agent-integration/opencode test` passed after aligning
  `todo.updated` event mirroring tests with opencode's wrapped event shape.
- `pnpm --dir agent-integration/pi/cockpit test` passed after PI cockpit response-envelope parsing was fixed.
- `pnpm -F fulcrum-agent-cli test -- hook-host-runtime hook-normalization`
  passed with 73 CLI test files and 813 assertions after Cursor documented
  `sessionStart` env handoff, Cursor/Copilot session lifecycle and read/search
  bias paths, Windsurf documented payload normalization, and Windsurf
  `pre_user_prompt` trusted-session bootstrap were verified.
- Package-local verification passed for every tested workspace: core 601,
  memory 1113, policy 108, CLI 813, fanout 250, monitor 134, planning 102,
  sync 26, teams 35, worker 33, workflows 36, worktrees 41, fulcrum-mcp 7,
  opencode plugin 30, PI cockpit 18, and scripts 63 tests. The root workspace
  is inventoried but has no package-local test script; root `pnpm test` covers
  the recursive workspace suites.
- `git diff --check` passed.
- Canonical docs inventory compare passed against `find docs -type f | sort`.
- Active stale-phrase scans passed for monitor auth, sync apply wording, fanout wording, TUI polling, `events.run_id`, process-boundary wording, wildcard exports, and current host docs. Remaining `mcp_config.json` mentions are historical plans, not current install docs.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm run check:cycles` passed.
- Prior broad gates (`pnpm test`, `pnpm build`, `pnpm run check:cycles`) still stand for the earlier targeted lane, but they do not close the reopened full-system gaps above.

### Workflow Lessons Fed Back

1. Full pass must start with a unit inventory and active-doc claim table before reading one implementation slice.
2. A package is not green because tests pass; every promised route, command, tool, control, stream, hook, installer artifact, and integration pair needs its own assertion.
3. Broad verification is only a regression net. It cannot substitute for missing smallest-unit verifiers.
4. Current authoritative docs (`AGENTS.md`, README, current guides, active reference checklists) are part of code alignment, not optional commentary.
5. Direct SQL around domain lifecycle is suspect until it proves status category, events, versioning, projections, and consumer-visible state.
6. External-sync conflict resolution is not complete until the resolved side is applied through the local domain/repository path and verified before status flips.
7. UI/TUI claims must decompose into per-field, per-key, per-pane, and per-refresh-mode assertions; a visible dashboard shell is not evidence that the feature shipped.
8. "All packages" includes the root workspace package and workspace graph, not
   just `packages/`; "all plugins/extensions" needs exact sentinel artifact
   paths and stale duplicate config removal or compatibility rows.
9. Host/plugin runtime acceptance must split config, dispatcher, payload
   normalization, session lifecycle, read/search/MCP bias, write/policy
   behavior, and negative paths. A write-only hook or static config check can
   never prove Fulcrum-first behavior.
10. Count-level inventory is still too coarse. Full-pass machinery needs a
    machine-readable unit ledger where every package export, route, command,
    tool, workflow step, installer, native plugin tool, and integration artifact
    has an explicit row and status.
11. Every package manifest extension declaration is an executable contract.
    `pi.extensions[]` and equivalent host manifest paths must resolve to real
    files, or the plugin/extension lane is a code gap.
12. Export-level coverage is still too coarse for packages. Package source
    files, tests, configs, generated artifacts, and manifest scripts need rows
    before a package can be called covered.
13. Artifact-level coverage is still too coarse for plugin/extension hosts.
    Hook config events, native extension events, native commands, and plugin
    hook keys need rows before a host can be called covered.

## Seventh Pass Full Workflow Run

Report: `docs/reference/2026-04-21-seventh-pass-full-workflow-run.md`.

Status: full workflow executed and current unit ledger closed to terminal
statuses. This pass ran the corrected workflow end to end: snapshot, 149-doc
inventory check, package/plugin/callable surface inventory, 2,769-row unit
ledger validation, subsystem package tests, integration guards, setup
dry-run/check, code/doc review gates, bounded fixes, terminal ledger closure,
external-blocker reduction, and post-fix broad verification.

### Seventh-Pass Finding

| ID | Subsystem | Claim | Observed state | Drift/gap type | Reviewer source | Verifier | Severity | Owner lane | Status |
|---|---|---|---|---|---|---|---|---|---|
| S7-TUI-001 | CLI TUI | Policy pane actions should target the selected visible blocked run even when policy violations appear before blocked runs. | `u` handled the policy violation offset, but `k` still used raw `blocked[selected]`, so kill could target the wrong row or no row. Added `selectedBlockedRun()` and regression coverage. | code gap | correctness, CLI readiness, testing, project standards | `packages/cli/src/tests/tui-contract.test.ts`; `pnpm -F fulcrum-agent-cli test -- tui-contract`; full `pnpm test` | P1 | CLI TUI | fixed |
| S7-INSTALL-001 | installer | Gemini setup should pass `setup:check` after installer reports success. | `gemini extensions install` exited 0 without materializing `~/.gemini/extensions/fulcrum`, so `setup:check` had not passed. Installer now verifies native output and falls back to file-copy. | integration gap | correctness, CLI readiness, project standards | Context7 Gemini CLI docs; `packages/cli/src/tests/install-gemini-pi-pr145.test.ts`; `pnpm run setup:gemini && pnpm run setup:check` | P1 | install/Gemini | fixed |
| S7-DOC-002 | workflow docs | Active workflow docs should match implemented step handlers. | `docs/guides/workflow-authoring.md` still called `validate_schema`, `run_tool`, `search_code`, and `search_web` future-only behavior even though `packages/workflows/src/step-executor.ts` and runner tests implement them. Guide now describes real behavior and conditional external dependencies. | doc drift | document-review, correctness, project standards | active-doc incompleteness scan; `packages/workflows/src/tests/runner.test.ts`; `pnpm -F fulcrum-workflows test -- runner` | P2 | workflows/docs | fixed |

### Seventh-Pass Blockers

| ID | Surface | Evidence | Status |
|---|---|---|---|
| S7-OP-001 | local install state | `pnpm run setup`, `pnpm run setup:gemini`, and `pnpm run setup:check` passed after the Gemini fallback fix. | fixed |
| S7-LEDGER-001 | full acceptance ledger | 2,769 rows now terminal: 2,769 accepted, 0 blocked, 0 open. | terminal-all-accepted |
| S7-REL-001 | release package rows | Signed `0.0.6` tags pushed for opencode and PI cockpit, both packages published to npm and verified as `latest: 0.0.6`; GitHub Actions publish auth remains missing `NPM_TOKEN`, so manual npm publish closed package availability. | fixed-with-ops-note |

### Seventh-Pass Verification

- `pnpm --dir scripts test -- surface-inventory config-integrity` passed.
- `pnpm run setup:dry` passed.
- `pnpm run setup:check` now passes after installer fix.
- `pnpm -F fulcrum-memory run eval:fulcrum-recall` passed.
- `pnpm -F fulcrum-memory run eval:longmemeval` passed.
- `pnpm run publish:dry` passed.
- `pnpm run publish:all` passed; no new packages should be published.
- Watch-script shape verifier passed for all 14 `test:watch` scripts.
- Temp package version verifier passed for opencode and PI cockpit
  patch/minor/major scripts.
- Release package closure passed for opencode and PI cockpit: package-local
  tests, packed-tarball secret scan, signed tag verification, remote tag
  verification, local authenticated `npm publish --access public`, and npm
  registry `latest: 0.0.6`.
- `git diff --check` passed.
- Docs inventory compare passed.
- Active-doc stale phrase scan ran and found deliberate open coordination rows.
- `pnpm --dir scripts test -- surface-inventory` passed with terminal ledger gate.
- `pnpm test` passed before and after the fixes; final CLI count is 813 assertions.
- `pnpm build` passed before and after the TUI fix.
- `pnpm run check:cycles` passed before and after the TUI fix.
- `npx ctx7@latest docs /google-gemini/gemini-cli "Gemini CLI extensions install local path extension directory behavior verification list"` grounded the Gemini CLI installer behavior.

### Seventh-Pass Workflow Lesson

14. Mixed UI/TUI lists need selection-to-action verifiers. If a pane merges
    heterogeneous rows, every mutating keybinding must prove the selected
    visible row maps to the intended backing entity. Rendering tests alone are
    not enough.
15. Terminal blockers should get a reduction loop before final reporting.
    Eval scripts, watch scripts, version scripts, and publish dry-runs can
    often be verified safely with focused commands, shape checks, or temp-copy
    execution. Leave only credentialed release/publish work as external.
16. Release blockers need a tag/version collision guard and CI publish
    diagnosis loop. Never reuse a failed release tag for a fixed workflow;
    bump to a fresh version, verify the version is unpublished, verify signed
    tags point at the intended commit, and distinguish code/scan failures from
    missing repository credentials.
