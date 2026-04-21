---
title: "Fifth pass subagent orchestration audit"
type: reference
date: 2026-04-21
origin: "Fifth pass adding subagent-orchestrated, skill-routed project alignment audit and fix workflow."
---

# Fifth Pass Subagent Orchestration Audit

This pass added the missing orchestration layer above the fourth-pass
subsystem and integration audits. Main agent remains the control plane. Focused
subagents, or packet-emulated subagents when no real subagent tool is exposed,
own narrow audits, fix plans, fixes, and re-reviews.

## Research Gate

External research was used before changing the workflow machinery:

- [Anthropic Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents): grounded separate context windows, task-specific prompts, focused tool access, and explicit/automatic delegation.
- [OpenAI Agents SDK multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/): grounded manager-style orchestration where one controller combines specialist outputs and enforces shared guardrails.
- [OpenAI Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/): grounded explicit validation and tripwire behavior around agent input/output.
- [Model Context Protocol tool annotations](https://modelcontextprotocol.io/specification/2025-11-25/schema): grounded read-only/destructive/idempotent/open-world hints as non-security-critical metadata.

Repo-internal behavior was grounded in `docs/guides/workflow-authoring.md`,
`docs/guides/agent-roles.md`, `packages/workflows/src/step-executor.ts`, and
Fulcrum delegation skills for `delegate-task`, `spawn-agent`, and
`team-launch`.

## Snapshot

| Item | State |
|---|---|
| Docs root | `docs/` |
| Docs count before this report | 145 |
| Docs count after this report | 146 |
| Docs count during actual fifth-pass run | 146 |
| Code/config/doc files covered by broad source scans | 1211 under `packages`, `agent-integration`, and `scripts` |
| Execution mode in this session | Packet-emulated subagents in main session; real Fulcrum delegation remains the default when available and policy/WIP permit. |
| New skills added | `subagent-orchestrated-project-pass`, `focused-subagent-task-packet`, `subagent-result-integrator`, `granular-feature-acceptance-auditor` |
| Existing skills updated | `docs-to-alignment-gap-workflow`, `project-alignment-reinitializer`, `subsystem-implementation-drift-auditor`, `integration-utilization-auditor`, `plan-code-drift-reviewer`, `full-project-gap-fixer`, `gap-report-closer`, `subagent-orchestrated-project-pass`, `focused-subagent-task-packet`, `subagent-result-integrator` |
| Repo state | Existing prior-pass work preserved; fifth pass changes layered on top. |

## Subagent Control Contract

| Responsibility | Owner |
|---|---|
| Source-of-truth order, lane graph, verifier ledger, merge decisions, final report | Main agent |
| One bounded audit/fix/review surface | Subagent or packet-emulated subagent |
| Packet shape and context capsule | `focused-subagent-task-packet` |
| Prior-request and feature completion rows | `granular-feature-acceptance-auditor` |
| Cross-lane merge, dedup, severity, next packets | `subagent-result-integrator` |
| Whole pass orchestration | `subagent-orchestrated-project-pass` |

Every delegated lane now requires:

- mission and reason
- context capsule
- exact source paths
- required focused skills
- research gate status
- allowed commands and forbidden scope
- expected output
- verifier
- self-check against original request
- return schema

## Lane Graph

| Lane | Surfaces | Status | Result |
|---|---|---|---|
| alignment | docs, plans, reports | Added to workflow | Alignment contracts now feed subagent context capsules. |
| feature-acceptance | prior requests, active tracks, web/UI, CLI/MCP/hooks/package units | Added to workflow after web-view miss | Active features now need smallest-unit rows before subsystem/fix lanes. |
| core-data | `core`, `memory`, `policy` | Added to workflow | Subsystem audit packets require correctness/testing/data/security review. |
| cli-install | CLI, MCP, hooks, install | Added to workflow | Packets require CLI readiness, TypeScript, and project standards review. |
| agent-integration | fanout, integration artifacts, skills | Added to workflow | Packets require agent-native review and skill-creator review. |
| execution | worker, workflows, teams, worktrees, planning | Added to workflow | Packets require architecture, reliability, and API contract review. |
| ops-docs | monitor, sync, docs, checklists | Added to workflow | Packets require document-review and triggered security/performance review. |
| integration | producer/consumer pairs | Added to workflow | Integration packets prove utilization, not file existence. |
| fix | accepted verifier-backed gaps | Added to workflow | Big gaps now get fix-plan, fix, re-review, and integration steps. |

## Actual Pass Run

After the orchestration skills were added, the pass was rerun against the docs
and code. This distinguishes workflow setup from an actual project pass.

### Source Coverage

| Lane | Path class | Evidence commands | Result |
|---|---|---|---|
| docs inventory | all docs | `find docs -type f | sort`; top-level inventory counts | 146 docs; inventory remained canonical. |
| active docs | AGENTS, guides, architecture, master plan, current plans/reference | stale phrase scans for counts, memory v2/v3 status, tool counts, package names, open-row markers | Found active memory-v3 drift in `AGENTS.md`, `agent-integration/claude/CLAUDE.md`, and `MASTER-PLAN.md`; fixed below. |
| historical docs | audit/history/brainstorms/handover/old plans | same stale phrase scans with source-order classification | Many historical stale counts/status strings remain; left as archival unless active docs depend on them. |
| core-data | `packages/core`, `packages/memory`, `packages/policy` | scans for wildcard exports, `.js` import suffixes, bare `ulid()`, role slug comparisons, task-by-ID workspace scoping | Later passes fixed the bounded task scoping debt in `updateTask`, planning relations, policy dependency checks, task-memory recall, and task-outcome synthesis. |
| cli-install | `packages/cli`, MCP, hooks, `agent-integration/install.ts` | MCP name scan, hook CLI scan, fanout import/call-site scan, install-mode scans | 32 public MCP tools remain current; later passes wired fanout consumption for Codex, opencode, Cursor, Windsurf, and Copilot generated installers. |
| agent-integration | `packages/agent-fanout`, `agent-integration`, skills | skill count scan, role catalog scan, generated artifact and dispatcher scans | 33 canonical skills and 24 role catalog files remain current; PI and Codex Fulcrum-first bias gaps were fixed in the sixth-pass reopen. |
| execution | worker/workflows/teams/worktrees/planning | package source/test scans, task lifecycle queries, public exports | Later passes fixed the bounded strict task scoping surfaces and verified planning/core/memory regressions. |
| integration | producer/consumer pairs | fanout producer/consumer scan, memory v3 doc-to-code scan, policy/run lifecycle scan | Memory v3 current docs align with shipped code; audited fanout and PI/Codex Fulcrum-first integrations were fixed in later passes. |

### Packet Ledger

| Lane ID | Surface | Mode | Status | Output | Verifier | Next |
|---|---|---|---|---|---|---|
| F5-L1 | docs active/current | packet-emulated | accepted | active memory-v3 stale docs found and fixed | stale phrase scan | static verification |
| F5-L2 | docs historical | packet-emulated | accepted | stale historical phrases classified as archival | source-order classification | docs-policy packet only if desired |
| F5-L3 | core-data | packet-emulated | fixed in seventh-cycle final check | strict task workspace scoping debt closed for planning relations, policy dependency checks, task-outcome synthesis, and task-memory recall | task query guard scan; targeted core/memory/planning tests | no remaining packet |
| F5-L4 | cli-install | packet-emulated | fixed in sixth/seventh passes | fanout consumption wired for generated Codex, opencode, Cursor, Windsurf, and Copilot installer artifacts | install fanout utilization tests; fanout tests | no remaining packet |
| F5-L5 | agent-integration | packet-emulated | fixed in sixth-pass reopen | Fulcrum-first bias fixed for PI and Codex with runtime-specific verifiers | hook/runtime scan | checklist refresh |
| F5-L6 | skills | packet-emulated | fixed | skills hardened to reject setup-only passes | skill content/link scan | static verification |

### Reviewed But Not Accepted As Gaps

| Surface | Scan | Result |
|---|---|---|
| process spawning boundary | `child_process` / `spawn` scan across non-test packages | Current `AGENTS.md` allows package-owned OS integrations such as git worktrees, installer probes, desktop openers, and index helpers. No gap accepted from these hits during this pass. |
| active open-row phrases | `partial`, `operator step`, `Decision needed`, `needs triage`, and blocker scans | Matches are expected current coordination rows in the master plan, integration checklist, and this report. No status flipped without verifier. |
| placeholder/TODO strings | source and active-doc scan | Matches are validator/test fixture terminology or explicit open coordination rows; no bounded code fix accepted. |

## Findings

| ID | Severity | Type | Surface | Finding | Reviewer sources | Verifier | Status |
|---|---|---|---|---|---|---|---|
| F5-001 | P1 | workflow-gap | pass orchestration | Existing workflow skills routed reviewers but did not define a conductor, lane graph, context capsules, or result merge protocol. | skill-creator, architecture-strategist, agent-native-audit | new skill bodies present and linked | Fixed |
| F5-002 | P1 | workflow-gap | delegated tasks | Existing skills did not force each delegated task to carry research gate, forbidden scope, verifier, self-check, and return schema. | skill-creator, project-standards-reviewer | packet schema in `focused-subagent-task-packet` | Fixed |
| F5-003 | P2 | workflow-gap | result integration | Multi-lane findings had no reusable merge/dedup/severity/verifier ledger skill. | maintainability-reviewer, testing-reviewer | `subagent-result-integrator` added | Fixed |
| F5-004 | P2 | process-gap | big code gaps | Strict task workspace scoping API migration and full installer fanout consumption were promoted to dedicated fix lanes and closed in later passes. | data-integrity-guardian, architecture-strategist, cli-agent-readiness-reviewer, agent-native-audit | final-cycle targeted tests; fanout utilization tests | Fixed in later passes |
| F5-005 | P3 | operator-gap | npm publish | opencode and PI cockpit publish rows were closed by signed tag checks, package-local tests, packed-tarball scans, manual authenticated npm publish, registry `latest` verification, and future `NPM_TOKEN` configuration. | project-standards-reviewer | release evidence | Fixed in seventh pass |
| F5-006 | P1 | doc-stale | active memory docs | `AGENTS.md` and Claude integration guidance still described Memory v3 as draft/not live even though active architecture docs and code show v3 is shipped and the flag is retired. | document-review, coherence-reviewer, data-integrity-guardian | active stale phrase scan | Fixed |
| F5-007 | P2 | code-gap | task workspace scoping | Final-cycle fix scoped planning relations, core policy dependency checks, CoS task-update ownership, memory task-outcome synthesis, and task-memory recall by `workspace_id`. | data-integrity-guardian, security-sentinel, correctness-reviewer | targeted cross-workspace regressions; core/memory/planning tests | Fixed in seventh-cycle final check |
| F5-008 | P2 | integration-gap | installer fanout | Generated installer artifacts for Codex, opencode, Cursor, Windsurf, and Copilot now consume current fanout emitter output; host-native plugin/package trees stay separate surfaces with their own verifiers. | cli-agent-readiness-reviewer, agent-native-audit, architecture-strategist | fanout import/call-site scan; install fanout utilization tests | Fixed in sixth pass |
| F5-009 | P2 | integration-gap | Fulcrum-first bias | Search-tool Fulcrum-first hook bias was wired through Claude/opencode/Gemini pre-hook paths, while PI and Codex needed runtime-specific lanes. PI now injects through `before_agent_start`; Codex now uses `PermissionRequest` search telemetry/nudge because PreToolUse is Bash-only. | agent-native-audit, cli-agent-readiness-reviewer, reliability-reviewer | PI cockpit tests; Codex hook tests | Fixed in sixth-pass reopen |
| F5-010 | P3 | doc-stale | historical docs | Historical brainstorm, audit, handover, and old plan docs still contain older package/tool/test/memory-status language. They are not current truth unless referenced by active docs. | document-review, scope-guardian-reviewer | source-order classification | Blocked: docs-policy decision |
| F5-011 | P2 | process-gap | claim verification | Naive catalog/count greps can create false positives, for example schema property `name:` fields when counting MCP tools. Skills now require source-shaped parsing for numeric claims. | testing-reviewer, project-standards-reviewer | updated packet/integrator/drift skill rules | Fixed |
| F5-012 | P1 | workflow-gap | feature acceptance | Prior passes did not force active features, including the web view / install TUI dashboard, into smallest-unit requirement rows with runtime proof. The workflow could pass without answering a direct feature-completion question. | granular-feature-acceptance-auditor, document-review, testing-reviewer, agent-native-audit | new skill plus orchestrator/drift/fix gates | Fixed in workflow; project audit still required |

## Big-Gap Packet Closure

| Packet | Scope | Required verifier before fix |
|---|---|---|
| `strict-task-workspace-scoping-api-migration` | `updateTask`, planning task relations, task-outcome synthesis, task-memory recall, policy dependency checks | Closed in later passes with cross-workspace regressions and targeted package tests. |
| `full-installer-fanout-consumption` | generated installer paths that should use fanout artifacts | Closed in sixth pass with install fanout utilization tests and fanout package tests. |
| `per-host-event-runtime-ledger` | Cursor/Windsurf/Copilot hook/event runtime scope | Closed through the sixth-pass unit ledger and terminal `surface-inventory` guard. |
| `historical-docs-archive-policy` | old brainstorm/audit/handover/planning docs with stale claims | Not an active code gap; historical docs remain archival unless referenced by current docs. |
| `operator-publish-closeout` | opencode and PI cockpit npm packages | Closed in seventh pass by release evidence and registry verification. |

## Lessons Fed Back Into Skills

- `subagent-orchestrated-project-pass` now has a pass-completion gate: skill
  edits alone are setup, not a pass.
- `granular-feature-acceptance-auditor` now freezes new planning until prior
  requested and active tracks have smallest-unit requirement rows.
- `focused-subagent-task-packet` now requires coverage evidence and
  source-shaped parsing for count/catalog claims, plus feature-acceptance packet
  fields.
- `subagent-result-integrator` now rejects pass completion without docs,
  subsystem, integration, and feature-acceptance lane evidence.
- `docs-to-alignment-gap-workflow` now requires an explicit source evidence
  report and a granular feature acceptance ledger before completion.
- `plan-code-drift-reviewer` now classifies active/current versus historical
  docs before recommending edits and routes active-feature claims through the
  granular acceptance auditor.
- `subsystem-implementation-drift-auditor` now requires invariant guard scans
  and a coverage table tied to feature rows when present.
- `integration-utilization-auditor` now requires explicit producer, consumer,
  and bypass lists for partial integrations, including feature-row producer and
  consumer paths.
- `full-project-gap-fixer` and `gap-report-closer` now close child requirement
  rows, not parent labels, and re-run acceptance before parent status flips.

## Web-View Miss Correction

Direct user question: "is the web view implemented as described in docs from
the start of this project till the end of it?" Prior workflow did not answer
that because it lacked a feature-level acceptance ledger. Subsystem scans can
find packages, integrations, and stale docs, but they do not prove a promised
view has route registration, UI controls, data wiring, empty/error/loading
states, tests, and browser/runtime proof.

Correction now encoded:

- The full workflow pauses new plans and ideas until all prior requested and
  active feature tracks have smallest-unit rows.
- Web/UI rows require browser or runtime proof, not grep-only evidence.
- Parent completion is blocked by any open child row, missing verifier, or
  runtime-unverified state.
- Large discovered gaps become dedicated fix-plan packets with verifiers before
  implementation.

## Verification

Static gates passed:

- `git diff --check`
- canonical inventory compare against `find docs -type f | sort`
- skill catalog/link check for new skills in both `/home/mkh/.codex/skills`
  and `/home/mkh/.raise/profiles/vanilla/codex/skills`
- targeted docs/skill grep checks
- targeted stale-claim scan; remaining matches are expected active status text,
  legitimate `fulcrum-core` rule filenames, or current checklist evidence

Broad gates passed:

- `pnpm test`
- `pnpm build`
- `pnpm run check:cycles`

The fifth-pass rerun changed skills and docs only. Existing prior-pass code
changes were reviewed and preserved. No new code fix lane was accepted because
remaining code gaps are large and require their own verifier-backed fix-plan
packets before implementation.

Post-fifth correction verification:

- `git diff --check` passed.
- Canonical inventory compare against `find docs -type f | sort` was clean;
  count stayed 146.
- `granular-feature-acceptance-auditor` is present through the linked local
  skill catalogs.
- Targeted skill/report grep confirms the granular feature gate is wired through
  orchestration, packet creation, drift review, subsystem audit, integration
  audit, gap fixing, gap closing, and result integration.
- Broad tests were not rerun for this correction because it changed docs and
  skill instructions only.
