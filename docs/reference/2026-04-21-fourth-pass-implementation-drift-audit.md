---
title: "Fourth pass implementation drift audit"
type: reference
date: 2026-04-21
origin: "Fourth pass full-project drift audit and fix workflow, routed through subsystem and integration audit skills."
---

# Fourth Pass Implementation Drift Audit

This pass added the missing code-audit layer to the docs-to-gap workflow:
subsystem implementation audit, cross-package integration/utilization audit, and
verifier-backed fixing before status changes.

## Snapshot

| Item | State |
|---|---|
| Docs root | `docs/` |
| Docs count before this report | 144 |
| Docs count after this report | 145 |
| Custom skills added | `subsystem-implementation-drift-auditor`, `integration-utilization-auditor`, `full-project-gap-fixer` |
| Existing skills updated | `docs-to-alignment-gap-workflow`, `project-alignment-reinitializer`, `plan-code-drift-reviewer`, `gap-report-closer` |
| Repo state | Existing second/third-pass changes preserved; fourth-pass fixes layered on top |

## Alignment-to-Code Contracts

| Subsystem | Contract | Primary verifiers |
|---|---|---|
| `core` | Own IDs, roles, tasks, runs, events, state projection, policy entrypoint, and workspace scoping. | `pnpm -F fulcrum-agent-core test`, role/ULID/check-constraint guards |
| `memory` | Own L0/L1/L2 memory, recall, curator, project/code context, Kuzu, vault, and lifecycle memory synthesis. | `pnpm -F fulcrum-memory test`, memory v3 tests, recall tests |
| `policy` | Own immutable system invariants, custom policy rules, secret guard, and audit log. | `pnpm -F fulcrum-policy test`, engine tests, policy guide scan |
| `cli`, MCP, hooks, install | Own command dispatch, MCP tools, action registry, hook normalization, runtime install/apply commands. | `pnpm -F fulcrum-agent-cli test`, config-integrity tests, CLI help probes |
| `agent-fanout` and `agent-integration` | Own canonical skill/rule fanout, generated agent artifacts, installer writes, and marketplace/publish scaffolding. | `pnpm -F fulcrum-agent-fanout test`, fanout scripts, integration checklist |
| `worker`, `workflows`, `teams`, `worktrees`, `planning` | Own execution adapter lifecycle, workflow step state, team templates, worktree merge flow, and planning entities. | Package tests, public export scans, cycle checks |
| `monitor`, `sync` | Own read-mostly HTTP/SSE metrics and external Plane sync/conflict paths. | Package tests, secret-scan-before-push checks |
| `docs/plans/reference/checklists` | Must describe current shipped behavior unless explicitly historical. | doc inventory compare, stale phrase scan, document-review pass |

## Subsystem Audit Findings

| ID | Surface | Reviewer route | Finding | Disposition |
|---|---|---|---|---|
| FP4-001 | `policy` docs | document-review, security-sentinel, project-standards | `AGENTS.md` said four system invariants while code/tests enforce five, including `capability_required_for_action`. | Fixed in `AGENTS.md` and `docs/guides/policy.md`. |
| FP4-002 | lifecycle docs/MCP | cli-agent-readiness, correctness, project-standards | `start_agent_run` guidance still omitted `context_type` in some generated/docs surfaces. | Fixed in canonical lifecycle rule, `AGENTS.md` generated block, `fulcrum-mcp` context, MCP schema/docs, worker/core docs. |
| FP4-003 | task workspace scoping | data-integrity, security, correctness | Several external or workflow task-by-ID reads had workspace context available but did not include it in the query. | Fixed bounded surfaces: CLI `tasks get`, internal `get_task`, `start_agent_run` task detection, `startAgentRun`, workflow `wait_for_task`, task blocker hydration, run escalation, and memory `project_context`. |
| FP4-004 | strict task API scoping | data-integrity, architecture, API | Some internal/public APIs still accept only `task_id` (`updateTask`, planning relations, task-outcome synthesis), so full strict scoping needs an API migration. | Left open as P2; not marked complete. Requires planned signature change and compatibility pass. |
| FP4-005 | `worktrees` public exports | architecture-strategist, maintainability | `packages/worktrees/src/index.ts` used wildcard exports despite current package-boundary guidance. | Fixed with explicit named exports. |
| FP4-006 | install/runtime docs | document-review, cli-agent-readiness, agent-native-audit | README/install docs overclaimed zero-install or all-agent coverage and underreported Codex/opencode/Copilot surfaces. | Fixed docs and installer comments to distinguish global setup, zero-install MCP setup, and scoped agent apply. |
| FP4-007 | worker/policy guide roles | document-review, project-standards | Worker guide named non-existent L1 roles. | Fixed to state `chief_of_staff` is the only built-in L1 role today. |
| FP4-008 | network/process rules | architecture-strategist, security-sentinel | Project rules banned all network/process use, contradicting shipped remote embedding/webhook/install probes and package-owned OS integrations. | Fixed wording to preserve local-first and worker-owned agent spawning without banning legitimate package-owned integration commands. |
| FP4-009 | hook/install utilization | cli-agent-readiness, agent-native-audit | Generated Copilot/Cursor/Windsurf hook config can emit `--event` forms; third-pass code now accepts those forms and fourth pass verified docs/help alignment. | Confirmed with CLI tests and docs updates. |

## Integration Utilization Audit

| Producer -> Consumer | Audit result | Verifier/source |
|---|---|---|
| core types/roles/IDs -> downstream packages | Canonical `newId()` and role helpers are covered by guard tests; remaining direct `ulid()` calls are documented allowlist entries. | `ulid-guard.test.ts`, role-string guard |
| policy -> CLI/hooks/run lifecycle | Policy invariant docs now match code; hooks list all supported CLIs. `checkPolicy` task lookup already scopes by workspace. | `policy` tests, `docs/guides/policy.md`, hook tests |
| memory -> CLI/hooks/MCP/recall | `project_context` task lookup now scopes by workspace. Task-outcome synthesizer remains a P2 API migration because it accepts only `task_id`. | `project-context.test.ts`, residual scan |
| fanout -> agent integration templates/installers | Fanout covers Claude, Codex, Gemini, opencode, PI, Copilot, Cursor, Windsurf. Some installers still consume committed templates/native source rather than all artifacts from fanout. | fanout tests, integration checklist |
| worker/workflows/teams/worktrees -> task/run lifecycle | `wait_for_task` now uses workflow workspace. `worktrees` exports are explicit. Worker lifecycle docs include `context_type`. | workflows tests, worktrees export scan |
| docs/checklists -> verifiers/tests | Active docs were refreshed where code was verifier-backed. Historical docs still contain old counts by design. | stale phrase scan, docs inventory compare |

## Fixes Applied in Fourth Pass

1. Created three reusable workflow skills for subsystem audit, integration audit, and verifier-backed gap fixing.
2. Updated the four existing workflow skills so future full passes cannot skip subsystem code audit, integration audit, fix loop, and re-review.
3. Scoped bounded task-by-ID code paths to `workspace_id` and added regression tests.
4. Added `context_type` to the `start_agent_run` MCP schema and refreshed docs/generated context guidance.
5. Corrected policy invariant, install, hook, worker role, network/process, and package export drift.
6. Regenerated the `AGENTS.md` managed block from canonical rules rather than editing the managed block by hand.

## Remaining Open Items

| ID | Item | Why open |
|---|---|---|
| OPEN-001 | Publish `@fulcrum-agent-os/opencode-plugin`. | External/operator npm release action, not a code gap. |
| OPEN-002 | Publish `@fulcrum-agent-os/pi-cockpit`. | External/operator npm release action, not a code gap. |
| OPEN-003 | Full installer fanout consumption for every agent. | Some agents intentionally still rely on committed/native templates. Needs a focused migration plan. |
| OPEN-004 | Full strict task workspace scoping API migration. | Requires changing public/internal signatures for `updateTask`, planning task relations, and task-outcome synthesis. |
| OPEN-005 | Historical docs with stale counts/old package names. | Archival by default; should be annotated only if docs policy changes. |

## Verification

Static gates passed:

- `git diff --check`
- canonical inventory compare against `find docs -type f | sort`
- stale active-doc phrase scan
- package wildcard export scan
- CLI help probes for hook/install/tool wording

Focused gates passed:

- `pnpm -F fulcrum-agent-core test -- runs tasks.labels --reporter=dot`
- `pnpm -F fulcrum-workflows test -- runner --reporter=dot`
- `pnpm -F fulcrum-agent-cli test -- mcp-server tool-registry hook-codex-pr6 hook-normalization copilot-compliance install-checkpoint --reporter=dot`
- `pnpm -F fulcrum-memory test -- project-context --reporter=dot`
- `pnpm -F fulcrum-agent-fanout test --reporter=dot`
- `pnpm --dir scripts test -- config-integrity --reporter=dot`
- `pnpm -F fulcrum-worktrees test --reporter=dot`
- `pnpm -F fulcrum-policy test --reporter=dot`
- `pnpm -F fulcrum-planning test --reporter=dot`

Broad gates passed:

- `pnpm test`
- `pnpm build`
- `pnpm run check:cycles`
