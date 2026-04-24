---
title: "feat: worktrees v2 — PM-flow modernization + orchestration gains"
type: feature
status: draft
date: 2026-04-18
origin: user-raised competitive audit on 2026-04-18; two research passes (PM-flow products + agent/git-orchestration products); see also docs/superpowers/plans/2026-04-13-worktrees.md (completed v1 build)
---

# Worktrees v2 — PM-Flow + Orchestration Roadmap

> **For agentic workers:** This plan evolves the existing `packages/worktrees` package (v1 ship plan at `docs/superpowers/plans/2026-04-13-worktrees.md`). Two research passes (logged below) fed this plan — one on PM tools (Jira, Linear, GitHub Projects v2, Plane, OpenProject, Redmine, Huly, Asana, ClickUp, Azure DevOps Boards, GitLab, Shortcut, Basecamp, Focalboard, Leantime, Vikunja, Kanboard), one on agent-orchestration/git tools (Graphite, Mergify, GitHub Merge Queue, GitButler, git-town, git-spice, git-branchless, MetaGPT, CrewAI, AutoGen, Cognition Devin, Factory.ai, Sourcegraph Batch Changes, OpenHands, SWE-agent, Aider, Conductor, code-conductor). See §Skill Utilization Matrix for skill→PR→unit mapping.

**Goal:** Close the measurable gaps between Fulcrum's current worktrees surface and the best PM-flow + orchestration prior art, **ranked by agent-productivity value, not human-PM polish**. The framing is agent-first throughout: rules as data (not WYSIWYG), events (not notifications), MCP/CLI parity (not dashboards-first).

**Why this lands:** `packages/worktrees` is called "worktrees" but its real shape is a PM system whose delivery artifact is a git branch/worktree. We already have tasks, a lifecycle state machine, role-routing, typed artifacts, artifact contracts, reviews, handoffs, and a policy-gated merge queue. What we *don't* have — a rule engine, typed task dependencies, generalized transition validators, state categories, iteration containers, or a field-permission model — are the things every serious PM product (Jira, Linear, OpenProject, Redmine, Azure DevOps) has made table stakes. Meanwhile the orchestration side (Graphite, Mergify, GitButler, git-branchless) has settled on batched speculative merge queues, stacked work items, and repo-state undo as the expected baseline. This plan imports the best of both, then rewires Fulcrum's v1 primitives on top.

**Tech Stack:** existing — TypeScript ESM, better-sqlite3, `ulidx`, `simple-git` + `git worktree` subprocesses, vitest. Per-PR feature flag `FULCRUM_WORKTREES_V2_<FEATURE>`. New optional deps: `ajv` (JSON-schema validation, PR 2), `@octokit/rest` (PR 9), a GraphQL server library TBD (PR 13).

**Non-goals (deferred to v2.1+):** Desktop GUI, hosted service mode, cross-workspace sharing, Docker/Firecracker sandboxing, full-text search across tasks, per-user notification/@mention system (see §Patterns Explicitly NOT Adopted), story-point estimation (same), Scrum ceremonies.

---

## Skill Utilization Matrix

### Cross-cutting (every PR, every unit)

| Skill | Role |
|---|---|
| `agent-skills:incremental-implementation` | Thin vertical slices; no PR exceeds ~500 diff lines; no unit lands without its Verify gate passing. |
| `agent-skills:test-driven-development` | Failing test FIRST, then thinnest impl. Every behavioural change has a committed regression test. |
| `agent-skills:context-engineering` | Load only the files the task requires. |
| `agent-skills:code-review-and-quality` | 5-axis self-review before requesting human review. |
| `compound-engineering:ce-review` | Persona-tiered review pre-merge when diff ≥50 LOC. |
| `agent-skills:git-workflow-and-versioning` + `compound-engineering:git-commit` | Atomic, value-communicating commits. |
| `compound-engineering:ce-pr-description` | Every PR has a value-first description. |
| `andrej-karpathy-skills:karpathy-guidelines` | Surgical changes, no speculative abstractions. |
| `agent-skills:source-driven-development` + `find-docs` | Verify `ajv`, `@octokit/rest`, GraphQL libs against current docs before implementation. |
| `episodic-memory:remembering-conversations` | Before starting any PR, search prior sessions for prior-art lessons. |

### Per-PR mapping

| PR | Theme | Additional skills |
|---|---|---|
| 1 | Foundations (state categories, flags, events, tiny columns) | `agent-skills:api-and-interface-design`, `agent-skills:documentation-and-adrs` |
| 2 | Validators generalizing `ArtifactContract` | `agent-skills:api-and-interface-design` |
| 3 | Role × type transition matrix + field permissions + named review rules | `agent-skills:security-and-hardening` |
| 4 | Typed task dependencies + intake + iteration container | `agent-skills:api-and-interface-design` |
| 5 | Rule engine core (trigger / condition / action, rules-as-data) | `agent-skills:api-and-interface-design`, `compound-engineering:agent-native-architecture` |
| 6 | Script Actions (rule-action = spawn_agent_run) + inbound webhooks | `agent-skills:security-and-hardening`, `agent-skills:source-driven-development` |
| 7 | Stacked worktrees + hierarchical `lead_engineer` delegation | `agent-skills:debugging-and-error-recovery` |
| 8 | Batched speculative merge queue + bisection | `agent-skills:performance-optimization`, `compound-engineering:ce-optimize` |
| 9 | Remote-PR projection (GitHub first) | `agent-skills:security-and-hardening`, `agent-skills:source-driven-development` |
| 10 | Event timeline + `fulcrum worktree undo` (repo-state replay) | `agent-skills:deprecation-and-migration`, `agent-skills:debugging-and-error-recovery` |
| 11 | Multi-repo `BatchHandoff` + virtual lanes (file-claim locks) | `agent-skills:api-and-interface-design` |
| 12 | Observable event stream (SSE) + Hill-chart snapshot | `agent-skills:frontend-ui-engineering` (if UI surface lands), `agent-skills:performance-optimization` |
| 13 | GraphQL + HMAC-signed webhook public surface | `agent-skills:api-and-interface-design`, `agent-skills:security-and-hardening` |
| 14 | Cutover + cleanup | `agent-skills:deprecation-and-migration` |

### Subagent delegation

| Work | Subagent | When |
|---|---|---|
| Competitive refresh (quarterly) | `compound-engineering:research:best-practices-researcher` | every ~90 days |
| Rule-engine adversarial review | `compound-engineering:review:adversarial-reviewer` | PR 5, PR 6 |
| Security audit: GitHub token + inbound webhook HMAC | `agent-skills:security-auditor` | PR 6, PR 9, PR 13 |
| Performance audit: merge-batch validator, rule evaluator | `compound-engineering:review:performance-reviewer` | PR 5, PR 8 |
| Architecture review: stacked-worktree + transition-matrix semantics | `Architecture Reviewer` | PR 3, PR 7 |
| Data-integrity review per migration | `compound-engineering:review:data-integrity-guardian` | every PR adding a migration |
| Correctness reviewer | `compound-engineering:review:correctness-reviewer` | pre-merge on every PR |

---

## Current-State Audit (what v1 shipped)

**Keep (proven primitives):**
- `packages/worktrees/src/worktrees.ts` — `allocateWorktree`, `markDirty`, `markReady`, `enqueueMerge`, `processMergeQueue`, `discardWorktree`, janitor.
- `packages/worktrees/src/schema.ts` — v1 tables: `worktrees`, `artifacts`, `reviews`, `handoffs`, `artifact_contracts`.
- `packages/worktrees/src/types.ts` — `Worktree`, `WorktreeStatus`, `Artifact`, `Review`, `Handoff`, `ArtifactContract`, `Handoff.handoff_mode`.
- Lifecycle `allocated → dirty → ready_for_merge → merged | discarded | conflict`.
- Policy gate: `processMergeQueue` restricted to role `integration_worker`.

**Rework (extended, not replaced):**
- `ArtifactContract` → generalized into `TransitionValidator[]` (PR 2).
- `processMergeQueue` → becomes a consumer of the rule engine's `state_changed(ready_for_merge)` trigger (PR 5); batched speculative validation added (PR 8).
- `Review` stays, but is spawned by declarative `ReviewRule` entries (PR 3).
- `Handoff.handoff_mode` stays as context-depth axis; `control_transfer` added as orthogonal axis (PR 1).

**Add (new primitives):**
- `state_category` column on worktrees (PR 1).
- `transition_validators` table — generalized `ArtifactContract` (PR 2).
- `role_transitions` + `field_permissions` tables — role × type × status matrix (PR 3).
- `review_rules` table — named auto-spawning review gates (PR 3).
- `task_dependencies` table — typed edges (`blocks`, `blocked_by`, `related`, `duplicate`, `child_of`, `follows`) (PR 4).
- `iterations` table + `tasks.iteration_id` column — timeboxed cadence container (PR 4).
- `intake_items` table — triage inbox, separate from the main queue (PR 4).
- `rules` + `rule_actions` + `rule_runs` tables — the rule engine (PR 5).
- `inbound_webhooks` table + `/hook/inbound/<id>` endpoint (PR 6).
- `worktrees.parent_worktree_id` column — stacked worktrees (PR 7).
- `worktree_merge_batches` table (PR 8).
- `pull_requests` table — worktree ↔ remote PR mapping (PR 9).
- `worktree_events` + `worktree_undo_log` tables (PR 10).
- `batch_handoffs` + `task_fanout_children` + `file_claims` tables (PR 11).

**Delete (after cutover, PR 14):**
- v1 hard-coded policy check in `processMergeQueue` (migrated to rule engine in PR 5).
- v1 `ArtifactContract.required_artifacts` after PR 2 cutover (rows migrated to `transition_validators`).

---

## Competitive Landscape

Two research passes (`compound-engineering:research:best-practices-researcher`, 2026-04-18). Full citation list at the bottom of this plan. One-line takeaway per product:

### PM-flow products

| Product | OSS | What they do better than us |
|---|---|---|
| **Jira** | No | **Workflow Validators + Preconditions** gate transitions on declarative conditions (generalized `ArtifactContract`) + **Jira Automation** rule engine. |
| **Linear** | No | **State categories** decouple engine (`started`, `completed`) from team's state names; typed issue relations. |
| **GitHub Projects v2 + Actions** | No | `project_v2_item` events → GitHub Actions = rules-as-code; `merge_group` webhook for queue. |
| **Asana** | No | Approvals as a first-class task type; **Script Actions** (rule action = serverless JS); generic **incoming web request** trigger. |
| **ClickUp** | No | Typed dependency edges (`blocking` vs `waiting_on`); custom fields as trigger *and* action. |
| **Azure DevOps Boards** | No | **State categories** + **process rules** (condition→action per field/transition); hierarchical Area Path routing. |
| **GitLab Issues + Epics** | Yes (MIT core; features tier-gated) | **Scoped labels** (exactly-one-of label groups); merge trains (sequential merge queue); MR approval rules. |
| **Shortcut** | No | Two state machines that roll up: Epic states distinct from Story states; iterations as timeboxes. |
| **Plane** | **Apache-2** | **Intake** — sealed triage inbox separate from the main board. |
| **OpenProject** | **GPL-3** | **Per-(role × work-item-type) transition matrix** — most expressive OSS state machine; Custom Actions (Enterprise). |
| **Taiga** | **MPL-2** | Swim-lanes as visually-encoded parent-child grouping. |
| **Redmine** | **GPL-2** | **Field permissions per role × tracker × status** (read-only / required / hidden) — finest authz model reviewed. |
| **Huly** | **MIT/FSL** | Unified event-sourced model across tracker+docs+chat. |
| **Leantime** | **AGPL-3** | Goal-first hierarchy (goals → milestones → tasks), mental-health-aware. |
| **Kanboard / Wekan / Vikunja** | **MIT / AGPL** | Kanboard's minimal `on-move-to-column run-action` trigger/action engine. |
| **Focalboard** | **Apache/MIT** | Notion-style typed cards; active community request for automation engine. |
| **Basecamp** | No | **Hill Charts** — two-phase progress (figuring-out uphill vs. executing downhill). |

### Agent / git-orchestration products

| Product | OSS | What they do better than us |
|---|---|---|
| **Graphite** | No | Stack-aware MQ runs CI once on top-of-stack; evicts failing PR + descendants only. |
| **GitHub Merge Queue** | No | Native speculative batches of 5; `merge_group` webhook for external CI. |
| **Mergify (CE)** | Partial | Automatic batch bisection when a merge batch fails. |
| **GitButler** | **FSL** | Virtual branches: multiple "lanes" in one working tree. |
| **git-town** | **MIT** | Parent-branch metadata → cascading rebase (`git town sync`). |
| **git-spice** | **GPL-3** | `gs stack submit` creates dependent PRs with auto-restack on trunk merge. |
| **git-branchless** | **GPL-2/MIT** | Repo-state `git undo` across full commit graph. |
| **OpenHands** | **MIT** | Event-stream actions (CmdRun, FileWrite...) as first-class ACI. |
| **SWE-agent** | **MIT** | LM-centric primitives (find_file, edit) — defer to v2.1. |
| **MetaGPT** | **MIT** | SOPs encode required artifact *content shapes* between agents. |
| **CrewAI / AutoGen** | **MIT** | Explicit `handoff` vs `agent-as-tool` distinction. |
| **Cognition Devin** | No | Hierarchical Devin-manages-Devin delegation. |
| **Factory.ai Droids** | Hybrid | Approved spec frozen-and-hashed as downstream input. |
| **Sourcegraph Batch Changes** | Hybrid | One declarative spec → N changesets across N repos. |

---

## Architecture Decisions

### AD-1 — Real `git worktree` stays the default isolation model

Virtual branches (GitButler) are tempting but reintroduce races we already avoid. Virtual-lane file-claim locking becomes the **fallback** for non-git projects or same-working-tree collisions (PR 11), never the default.

### AD-2 — State categories decouple engine from naming

Every worktree state declares `category ∈ {backlog, unstarted, started, completed, canceled}` (Linear / Azure DevOps Boards / Plane convention). Existing names (`allocated/dirty/ready_for_merge/merged/discarded/conflict`) map to categories; `processMergeQueue` operates on category, not name. Unlocks custom states later without queue rewrites.

### AD-3 — Validators generalize `ArtifactContract`

Jira's Workflow Validators + OpenProject's preconditions are the prior art. A transition fires only if every `TransitionValidator` for that `(from_category, to_category, task_type, role)` passes. "Required artifact final" is **one** validator kind; others include "all reviews approved", "no open `blocks` dependency", "CI pass event received". `ArtifactContract.required_artifacts` becomes a row in `transition_validators` with `kind='artifact_final'`.

### AD-4 — Rules-as-data, not rules-as-UI

Jira Automation + Asana Rules + Azure DevOps process rules + Kanboard on-move actions all converge on `trigger → [conditions] → actions` as the universal primitive. We store rules as **data rows** (YAML-authored, diff-reviewable), not a WYSIWYG editor. Our current merge-queue gate becomes one rule row; every future automation adds a row, not code.

### AD-5 — Script Actions = `spawn_agent_run`

Asana exposes rule actions as serverless JS; OpenProject Custom Actions run server-side mutations. Our agent-native form: a rule action can be `spawn_agent_run(role, prompt_template, task_context)`. Fuses the rule engine with the primitive we already own (`agent_runs`).

### AD-6 — Typed dependency edges are first-class

ClickUp (`blocking` / `waiting_on`), Linear (`blocks` / `blocked_by` / `related` / `duplicate`), Azure Boards (predecessor / successor / related / affects) all ship typed edges. We add `task_dependencies(from_task, to_task, edge_type)` with a bounded enum; the rule engine + scheduler query it to surface unblocked work.

### AD-7 — Role × work-item-type transition matrix

OpenProject + Redmine show that workflow semantics must fan out on role AND type. A `role_transitions` table replaces the hard-coded `integration_worker`-only check. Future role `release_manager` adds a row, not a code branch.

### AD-8 — Field permissions per role × status

Redmine's authz model: a field can be `required | read_only | hidden | editable` per `(role, task_type, status)`. Replaces bespoke "reviewer can edit while in `ready_for_merge` but not after `merged`" checks.

### AD-9 — Stacked worktrees via `parent_worktree_id`

Competitors (git-town, git-spice, Graphite) store parent metadata on the branch; Fulcrum's coordination unit is the worktree, so metadata lives on the worktree row. Parent merge → children auto-rebase; parent conflict → children block; parent discard → children cascade-discard.

### AD-10 — Merge queue is a consumer of the rule engine, not a separate subsystem

After PR 5, `processMergeQueue` becomes the default action of a rule: `trigger=state_changed(ready_for_merge) → condition=caller.role==integration_worker → action=merge(strategy=batch)`. Batched speculative CI (PR 8) is an enhancement to the `merge` action, not a new subsystem.

### AD-11 — Remote PR is a projection, never the source of truth

Code-conductor collapses lifecycle into GitHub labels; we don't. SQLite stays authoritative; `pull_requests` is a map. Offline-first.

### AD-12 — Event log is append-only and replayable

git-branchless earns `git undo` by logging every ref change. We log every lifecycle transition + rule run + review action into `worktree_events`; `fulcrum worktree undo` reverse-applies events, with git-level compensations via `git reset --hard <snapshot_ref>`.

### AD-13 — Public surface is GraphQL + HMAC-signed webhooks + MCP/CLI

Linear + GitHub Projects v2 + GitLab all converge on typed GraphQL + signed webhooks. MCP stays the primary agent surface (loopback, privileged); GraphQL + webhooks are for external interop (CI, Slack, other workspaces), shipped in PR 13.

---

## Patterns to Adopt (22, merged + ranked, mapped to PRs)

Numbering scheme: `P{N}` = pattern index; column **Source axis** is `PM` or `ORCH` for which research pass surfaced it (some appear in both).

| # | Pattern | Source axis | Sourced from | PR | Cost |
|---|---|---|---|---|---|
| P1 | State categories (engine reasons on category, UI shows name) | PM | Linear, Azure DevOps Boards, Plane | 1 | S |
| P2 | `control_transfer: delegate \| transfer` on Handoff | ORCH | CrewAI, AutoGen | 1 | S |
| P3 | Typed content contract per artifact (`content_contract` JSON schema) | ORCH | MetaGPT SOPs | 1 | S |
| P4 | Approved-spec freeze at `Review.approved` (hash + immutable) | ORCH | Factory.ai | 1 | S |
| P5 | Scoped labels (exactly-one-of label groups) | PM | GitLab | 1 | S |
| P6 | `fulcrum.merge_candidate` event emitted on `markReady` | ORCH, PM | GitHub Merge Queue `merge_group` | 1 | S |
| P7 | Workflow Validators — generalize `ArtifactContract` into `TransitionValidator[]` | PM | Jira, OpenProject, Azure DevOps | 2 | M |
| P8 | Role × type × (from→to) transition matrix | PM | OpenProject, Redmine | 3 | M |
| P9 | Field permissions per role × type × status | PM | Redmine | 3 | M |
| P10 | Named `ReviewRule` (auto-spawn `Review` rows on trigger) | PM | GitLab MR Approval Rules, Asana Approvals | 3 | S–M |
| P11 | Typed `task_dependencies` with bounded edge enum | PM | ClickUp, Linear, Azure Boards | 4 | M |
| P12 | Intake queue (separate triage primitive) | PM | Plane, Linear Triage | 4 | S |
| P13 | Iteration/cycle container + rollover janitor | PM | Linear, Shortcut, GitLab Iterations | 4 | M |
| P14 | Rule engine (trigger/condition/action, rules-as-data) | PM | Jira Automation, Asana Rules, Azure DevOps rules, Kanboard | 5 | L |
| P15 | Script Actions — rule action = `spawn_agent_run(role, prompt)` | PM | Asana Script Actions, OpenProject Custom Actions | 6 | M |
| P16 | Inbound web-request trigger (generic webhook → rule) | PM | Asana, Jira, ClickUp | 6 | S |
| P17 | Stacked worktrees via `parent_worktree_id` + auto-rebase cascade | ORCH | git-town, git-spice, GitButler | 7 | M |
| P18 | Hierarchical `lead_engineer` delegation (parent allocates children) | ORCH | Cognition Devin | 7 | M |
| P19 | Batched speculative merge queue + bisection | ORCH, PM | Graphite, Mergify, GitHub MQ, GitLab merge trains | 8 | M |
| P20 | Remote-PR projection (GitHub first) | ORCH, PM | Graphite, Factory, GitHub Projects | 9 | M |
| P21 | Append-only event log + `fulcrum worktree undo` | ORCH | git-branchless, OpenHands event stream | 10 | M |
| P22 | Multi-repo `BatchHandoff` + file-claim virtual lanes | ORCH | Sourcegraph Batch Changes, GitButler | 11 | M–L |
| P23 | SSE event stream + Hill-chart snapshot in monitor | PM, ORCH | Basecamp Hill Charts, Conductor | 12 | M |
| P24 | GraphQL + HMAC-signed webhooks public surface | PM | Linear, GitHub Projects v2, GitLab | 13 | M |

(Pattern on SWE-agent ACI primitives deferred to v2.1 as an experimental track — orthogonal to orchestration/PM-flow.)

---

## Patterns to Explicitly NOT Adopt

**N1. Story-point estimation / velocity charts.** Every major PM tool ships this (Jira, Azure, ClickUp, Shortcut). Humans use them because humans are the unit of capacity. Agents are ephemeral and parallelizable; story-point velocity is a metric with no agent analog. Adopting it invites agent prompts to "estimate story points" — pure waste.

**N2. WYSIWYG rule builder UI.** Jira Automation, Asana Rules, ClickUp all have it. UI-first rule editing actively *prevents* rules-as-code workflows, which is exactly what agents need. Fulcrum rules are authored as YAML/TS and live in the repo (AD-4); CLI + diff-reviewable. (Jira's own history is the cautionary tale.)

**N3. Per-user notification preferences / @mention digests.** Linear, Jira, Asana, Slack-integrated tools all invest heavily here. Agents don't have inboxes — they have event subscriptions. Replicating the human notification system is expensive and gives zero agent value. Emit structured events; let consumers filter.

**N4. Gantt charts + WBS critical-path scheduling.** OpenProject, MS Project, GitLab premium. Useful when humans are the bottleneck and serialization is expensive. Agents get scheduled by the rule engine + typed dependencies (P11 + P14); no critical-path visualization needed.

**N5. Sprint ceremonies (commitment, planning, retro, review).** Scrum exists to coordinate humans with finite capacity. Fulcrum's agents have effectively unbounded-parallel capacity with heterogeneous cost. We adopt iterations as a **metric container** (P13), not as a commitment ceremony.

**N6. Virtual branches as the default isolation model (GitButler).** Reintroduces working-tree races. Adopt only as fallback for non-git (P22).

**N7. Per-edit auto-commit (Aider).** Floods branches with noise; breaks the `dirty → ready_for_merge` deliberate-promotion gate; makes `git bisect` useless.

**N8. Docker-per-session sandbox as the default (OpenHands).** OpenHands V1 itself backed off. Keep Docker as an optional executor.

**N9. Unstructured GroupChat handoff (AutoGen).** Fights our typed `Handoff` + contracts direction; reintroduces context drift that MetaGPT-style SOPs exist to fix.

**N10. GitHub-issue-as-state-store (code-conductor).** Makes GitHub an availability dependency, breaks offline, collapses typed lifecycle into labels.

---

## Gap Analysis — Ranked by Agent-Productivity Value

1. **Rule engine (trigger/condition/action), rules-as-data.** Our merge queue is a hand-coded rule — ONE rule. Every other policy we'll ever want (`auto-discard dirty worktree after 72h`, `on Review.rejected re-run software_engineer`, `when artifact_final + CI green → markReady`) needs this. **Single biggest lever.** → PR 5.
2. **Typed dependency edges between tasks.** Scheduler cannot answer "what's unblocked now?" without this — the #1 dispatch query. → PR 4.
3. **Workflow Validators generalizing `ArtifactContract`.** Same validation machinery needs to gate reviews, dep status, CI status — not just artifacts. → PR 2.
4. **Inbound webhook trigger.** Bridges external events (CI, GitHub, Slack) into the rule engine without custom adapters per system. → PR 6.
5. **State categories.** Without them, every future custom state breaks the queue. → PR 1.
6. **Named `ReviewRule` (auto-spawn reviews on trigger).** Agents shouldn't have to remember "spawn a security review for `auth/` changes". → PR 3.
7. **Intake queue** as a separate primitive so untriaged webhook-born work doesn't pollute the main queue. → PR 4.
8. **Iteration container** for throughput metrics — needed to detect regressions in agent productivity. → PR 4.
9. **Batched speculative merge queue.** Our FIFO will not scale past ~1 merge per CI cycle. → PR 8.
10. **Role × type transition matrix.** Needed before introducing a second task type (PRD-review flow ≠ code-merge flow). → PR 3.
11. **Remote-PR write-back.** Today merges are local-only. → PR 9.
12. **Append-only event log + repo-state undo.** Rollback today is manual git surgery. → PR 10.
13. **Stacked worktrees / dependent work.** Agent B cannot build on Agent A's in-flight worktree. → PR 7.
14. **Cross-worktree file locking.** Parallel agents in sequential mode silently overwrite each other. → PR 11.
15. **Observable live event stream.** No human-visible timeline of what N agents are doing. → PR 12.
16. **Multi-repo batch spec.** N-repo refactor requires N hand-created tasks. → PR 11.

---

## Critical Constraints (carry forward)

1. **Global-only data** (HARD). All worktree + task + rule + event rows under `globalDataDir()`. Never project-local.
2. **Policy gating stays strict.** Destructive operations (`processMergeQueue`, `publishRemotePR`, `mergeRemotePR`, `worktreeUndo`, rule-engine authoring) remain role-gated. Specifically: `integration_worker` for merge-path ops; `chief_of_staff` for BatchHandoff and cross-workspace rules; `lead_engineer` (new, PR 7) for child-worktree allocation under its own parent.
3. **No breaking v1 API.** `allocateWorktree`, `markDirty`, `markReady`, `enqueueMerge`, `discardWorktree`, `processMergeQueue` keep signatures. New capabilities are new names; new fields are additive nullables pre-cutover.
4. **Event log is append-only.** `worktree_events` never UPDATE or DELETE. Undo writes a compensating event.
5. **Offline-first.** Every v2 capability continues to work with no network. Remote-PR sync is opt-in (env flag + credentials present).
6. **Reversible migrations.** Every schema change has documented rollback SQL in the migration comment block, following the memory-v3 convention.
7. **CLI-first, MCP overlay, GraphQL external.** Every new capability reachable via `fulcrum action exec`. MCP tools are thin shims. GraphQL + webhooks are for non-agent external consumers (PR 13).
8. **Agent-native parity.** Every action a user can take (create rule, typed dep, claim file, undo, batch, publish-PR) an agent with the right role can also take via CLI/MCP.
9. **Rules-as-data.** Rules live in the DB as rows plus `.yaml` seed files in the repo. No WYSIWYG UI in v2.
10. **No story points, no sprints, no human notifications.** See §Patterns Explicitly NOT Adopted.
11. **Rule authorship is `chief_of_staff`-only (HARD, PR 5a).** `fulcrum rules create|update|enable` and the YAML loader enforce the gate. `rules.author_agent_id` records the author. `spawn_agent_run` actions enforce an **action-level ceiling**: the target role cannot exceed the rule author's privilege level. Policy rule ID: `rules.authorship_gate`.
12. **Event-namespace ACL (HARD, PR 5a).** Rules subscribing to `fulcrum.l0.*`, `fulcrum.l1.*`, `fulcrum.curator.*` require `chief_of_staff + memory_scope_approved` capability. `fulcrum.rule.*` triggers are forbidden in v2.0 (deferred to v2.1 with explicit cycle-detection design). Enforced at rule creation.
13. **Cycle detection (HARD, PR 5a).** Max chain depth 10; `(source_event_id, rule_id)` chains tracked; cycles aborted + logged to `rule_runs.status='cycle_aborted'` + `Review` spawned for the author.
14. **Secrets handling (HARD).** PR 6 webhook secrets, PR 9 `GITHUB_TOKEN`:
    - Never stored in any `*_json` column (`rule_runs.result_json`, `worktree_events.payload_json`, etc.). Action handlers redact credential-shaped substrings in error paths before persistence.
    - Inbound webhook secrets stored as `bcrypt(secret)` in `inbound_webhooks.secret_hash`; raw secret only in process memory at creation time.
    - `GITHUB_TOKEN` read from env var only; never from project-local files; never written to any table.
    - Rotation: `fulcrum webhooks rotate <id>` invalidates old secret atomically; tokens external to Fulcrum rotate on operator schedule.
    - Replay defense: inbound webhooks maintain a 5-minute signature-digest cache (`webhook_replay_cache` table with UNIQUE index); duplicate signatures within window are rejected with HTTP 409.
15. **Condition DSL uses role helpers, not raw string compare (HARD, PR 5a).** `canMerge(caller)`, `isRole(agent, role)`, `hasOpenBlocks(task)` — same helpers as `packages/core/src/roles.ts`. Raw string-equality on role names rejected at rule creation via `role-string-guard.test.ts` extended to cover the DSL.

---

## Migration Mechanics

Per convention established by memory v3 (`packages/memory/src/schema.ts`) and extension packages (teams 006, workflows 007):

- DDL as template-string constants in `packages/worktrees/src/schema.ts`.
- `runMigration2NNName(db)` TS functions; `PRAGMA table_info` guards for `ALTER TABLE ADD COLUMN`; `INSERT OR IGNORE INTO schema_migrations(name)` ledger rows.
- Rollback SQL documented inline as comment blocks above each forward DDL.
- Number block **201..214** reserved for worktrees v2 (above memory v3's `101..104` and the extension-package range).

| # | Migration | PR | Purpose |
|---|---|---|---|
| 201 | `runMigration201WorktreesV2Foundations` | 1 | State categories, `control_transfer`, `content_contract`, `merge_candidate_ref`, scoped labels (`label_scopes` table) |
| 202 | `runMigration202WorktreesV2Validators` | 2 | `transition_validators` table; migrate `artifact_contracts.required_artifacts` rows |
| 203 | `runMigration203WorktreesV2Authz` | 3 | `role_transitions`, `field_permissions`, `review_rules` tables |
| 204 | `runMigration204WorktreesV2DepsAndIterations` | 4 | `task_dependencies`, `iterations`, `intake_items` tables |
| 205 | `runMigration205WorktreesV2RuleEngine` | 5a | `rules`, `rule_actions`, `rule_runs` tables + trigger_event ledger for cycle detection |
| 206 | `runMigration206WorktreesV2Webhooks` | 6 | `inbound_webhooks`, `script_action_registry`, `webhook_replay_cache` tables |
| 207 | `runMigration207WorktreesV2Stacks` | 7 | `worktrees.parent_worktree_id` + index |
| 208 | `runMigration208WorktreesV2MergeBatches` | 8 | `worktree_merge_batches` + `worktrees.batch_id` |
| 209 | `runMigration209WorktreesV2RemotePRs` | 9 | `pull_requests` table |
| 210 | `runMigration210WorktreesV2Events` | 10 | `worktree_events`, `worktree_undo_log` tables |
| 211 | `runMigration211WorktreesV2BatchAndLanes` | 11 | `batch_handoffs`, `task_fanout_children`, `file_claims` tables |
| 212 | **(reserved for v2.1)** | 13 deferred | `webhook_subscriptions`, `api_tokens` — claimed when v2.1 plan opens |
| 213 | `runMigration213WorktreesV2Cutover` | 14 | Flip v2 nullables to NOT NULL; drop `artifact_contracts.required_artifacts` after row migration to `transition_validators` |

---

## Phased Rollout (PRs)

**Every PR ends with CI-green tests + a one-line `CHANGELOG.md` entry. No PR exceeds ~500 diff lines.** If a unit would cross, it splits.

### PR 1 — Foundations (state categories + 5 tiny additions)

**Goal:** Six independent small changes that set up every downstream PR. All flag-off by default (`FULCRUM_WORKTREES_V2_FOUNDATIONS`).

**Units:**
- **1.1** `runMigration201WorktreesV2Foundations` — adds `worktrees.state_category TEXT`, `handoffs.control_transfer TEXT DEFAULT 'delegate'`, `worktrees.merge_candidate_ref TEXT`; creates `label_scopes(scope_id, scope_name, project_id, allowed_values_json TEXT)` + `task_labels(task_id, scope_id, value)` with `UNIQUE(task_id, scope_id)` for scoped-label exactly-one-of. (Collapses earlier 3-table design into 2 — `allowed_values_json` is an application-validated JSON array; see Finding M3 in 2026-04-18 review.) **Note: `content_contract` column is moved to PR 2 alongside the validator library decision** (per Finding P5/H7 — the consuming PR owns the column shape).
  - **Skills:** `compound-engineering:review:data-integrity-guardian` + `compound-engineering:review:schema-drift-detector` pre-merge.
- **1.2** `packages/worktrees/src/state-categories.ts` — static map from existing state names to categories; exports `categoryOf(state)` + `STATE_CATEGORY` enum. Tests: every existing state has a category; engine refuses unknown state.
- **1.3** `createHandoff` accepts optional `control_transfer`; `completeRun` reopens parent for `delegate`, closes for `transfer`.
- **1.4** (moved to PR 2) — spec-freeze hook lands with the validator library so freezing and validation share one representation.
- **1.5** **Reuse existing `FulcrumEventBus`** (`packages/core/src/event-bus.ts`). Extend the `EventType` union in `packages/core/src/types.ts` with `merge_candidate`. On `markReady`, call existing `emitEvent({ event_type: 'merge_candidate', ... })` which already fires both a DB row and the in-process bus. **Do NOT create a new `packages/worktrees/src/events.ts` module.** (Per Finding C1 — the bus is already typed, swappable, and tested; forking it splits memory-v3 + worktrees-v2 subscribers.)
  - **Skills:** `agent-skills:api-and-interface-design` (additive `EventType` change is a stable public contract).
- **1.6** `packages/worktrees/src/labels.ts` — `setTaskLabel(task, scope, value)` validates `value ∈ label_scopes.allowed_values_json` + enforces exactly-one-of via UNIQUE; tests cover displacement + invalid-value rejection.

**Verify:** `pnpm -F fulcrum-worktrees test` passes all new tests; `packages/core/src/tests/event-bus.test.ts` still green after the `EventType` extension; existing worktrees tests unchanged.

### PR 2 — Transition Validators (generalize `ArtifactContract`)

**Goal:** Generalize `ArtifactContract` into a pluggable validator surface. Adds first-class validator kinds.

**Units:**
**Architecture note (AD-9-addendum).** `TransitionValidator` is NOT a separate evaluation path from the PR 5 rule engine — it's *sugar* over the rule engine's `state_transition_attempted` trigger. A validator row semantically means: "a rule with `trigger=state_transition_attempted(from,to)` and `action=block_if_condition_fails(config_json)`." PR 2 ships the validator surface as a thin builder that writes directly to the `transition_validators` table; once PR 5 ships the rule engine, a migration collapses validator rows into `rules` rows. **There is ONE condition-evaluation model for the whole project** (per Finding H7). PR 2 uses a stub evaluator with the same condition DSL PR 5 will formalize.

**Units:**
- **2.1** Decide the validator library (`ajv` vs `zod` vs `typebox` vs hand-rolled) via `find-docs` **before writing any code**. Document the decision and rationale inline here. Column shape for `artifact_contracts.content_contract` (deferred from PR 1) depends on the choice. (Resolves Open Question #2.)
  - **Skills:** `agent-skills:source-driven-development` + `find-docs` on all candidates; `compound-engineering:review:api-contract-reviewer` for the decision doc.
- **2.2** `runMigration202WorktreesV2Validators` — `transition_validators(validator_id, task_type, from_category, to_category, role, kind, config_json, created_at)`; `artifact_contracts.content_contract TEXT` (shape per 2.1 decision). **Validator migration axes:** legacy `artifact_contracts.required_artifacts` is per-`task_id`; new rows carry `(task_type, from_category, to_category, role)`. Strategy: infer `task_type` from existing `tasks.task_type` FK join; default `from_category = 'started' → to_category = 'completed'` (the single transition v1 enforced); default `role = ANY` (validator applies to all roles unless narrowed). Dry-run prints the mapping table with per-row justification before commit. (Per Finding F3 — plan-level mapping was previously unspecified.)
  - **Skills:** `agent-skills:deprecation-and-migration`, `compound-engineering:review:data-migration-expert` pre-merge.
- **2.3** `packages/worktrees/src/validators/` — validator kind registry. Initial kinds: `artifact_final`, `review_approved`, `no_open_blocks`, `ci_status_green`, `field_required`.
  - **Skills:** `agent-skills:api-and-interface-design` (validator kind surface is the same surface PR 5 formalizes).
- **2.4** `runTransitionValidators(task, from_cat, to_cat, role): Result[]` — pure function; returns failing validators with structured error codes. Internally uses the same condition DSL PR 5 will ship as the rule-engine condition language; until PR 5 lands, the DSL is a stub with a pinned subset of predicates.
- **2.5** Spec-freeze hook (moved from PR 1.4) — `approveReview()` callback for spec artifacts computes `content_hash` + flips `status='final'`; re-approve is a no-op. Freeze validation reuses the PR 2 validator library.
- **2.6** Wire `markReady`, `markDirty`, `enqueueMerge` to call `runTransitionValidators` and reject on any failure with an actionable error payload.
- **2.7** Back-compat shim: legacy `ArtifactContract` reads still return equivalent validator rows via a view.

**Verify:** every existing `ArtifactContract` enforcement test passes through the new path with identical error messages.

### PR 3 — Role × type transition matrix + field permissions + review rules

**Goal:** Replace hard-coded `integration_worker`-only policy with a data-driven authz model.

**Units:**
- **3.1** `runMigration203WorktreesV2Authz` — `role_transitions(role, task_type, from_category, to_category, allowed)`, `field_permissions(role, task_type, status, field_name, mode)` where `mode ∈ {editable, required, read_only, hidden}`, `review_rules(rule_id, trigger_spec_json, reviewer_role, target_type, target_filter_json, active)`.
  - **Skills:** `agent-skills:security-and-hardening` (authz model correctness), `compound-engineering:review:security-reviewer` pre-merge (role gates are exploitable if wrong).
- **3.2** Seed rows for existing behavior: `role_transitions(integration_worker, 'default', 'started', 'completed', true)` plus the current transitions each agent role can perform.
- **3.3** `checkTransition(role, task_type, from_cat, to_cat): boolean` pure function; replaces hard-coded check in `processMergeQueue`.
- **3.4** `checkFieldAccess(role, task_type, status, field, operation): boolean` pure function; called from every `Review`/`Artifact` mutation path.
- **3.5** Review rule evaluator: on trigger events (artifact created, artifact final, review approved, …) check `review_rules.trigger_spec_json`; auto-spawn `Review` rows for matches.
- **3.6** Tests: existing merge-queue policy test passes unchanged; new test for a second task type with different transition rules; field-permission test for reviewer writing to a closed worktree (rejected).

**Verify:** existing merge-queue gate passes; a second task_type (`prd_review`) with different transitions coexists; `ReviewRule` auto-spawns a `Review` when spec artifact finalizes.

### PR 4 — Typed dependencies + intake + iterations

**Goal:** Scheduler knows what's unblocked; triage inbox separated from main queue; throughput measured per iteration.

**Units:**
- **4.1** `runMigration204WorktreesV2DepsAndIterations` — `task_dependencies(from_task, to_task, edge_type CHECK IN ('blocks','blocked_by','related','duplicate','child_of','follows'))` with FK cascades; `iterations(iteration_id, workspace_id, project_id, name, start_at, end_at, status, rollover_strategy)`; `intake_items(intake_id, workspace_id, payload_json, source, received_at, triaged_at, triaged_by, resulting_task_id)`; `tasks.iteration_id` nullable column.
- **4.2** `addDependency(from, to, edge_type)` + cycle detection (DFS) + tests.
- **4.3** `listUnblockedTasks(workspace, role): Task[]` pure function — joins `tasks` + `task_dependencies` + `role_transitions` to produce the dispatch candidate list.
- **4.4** `processMergeQueue` checks `blocks`/`blocked_by` edges before dequeue; rejects a task with open `blocks` dependencies.
- **4.5** Intake: `submitIntake(payload, source)` returns `intake_id`; `promoteIntake(intake_id, task_spec)` moves it into `tasks` (gated to `chief_of_staff`); janitor auto-expires intake older than N days.
- **4.6** Iteration rollover: janitor runs at iteration `end_at` and re-parents unfinished tasks into next iteration; metrics (`completed_count`, `carryover_count`) persisted on the closed iteration.

**Verify:** cycle detection rejects `A blocks B, B blocks A`; `listUnblockedTasks` returns expected subset in mixed-deps fixture; rollover moves carryover tasks.

### PR 5 — Rule engine core

**Goal:** The biggest lever. `trigger → [conditions] → actions`, rules-as-data.

**Units:**
- **5.1** `runMigration205WorktreesV2RuleEngine` — `rules(rule_id, name, trigger_spec_json, conditions_json, active, version, author_agent_id, created_at)`; `rule_actions(rule_id, ordinal, action_kind, config_json)`; `rule_runs(rule_run_id, rule_id, trigger_event_id, status, started_at, completed_at, result_json)`.
  - **Skills:** `compound-engineering:agent-native-architecture` (load-bearing — this is the central agent-facing primitive), `agent-skills:api-and-interface-design`.
- **5.2** `packages/worktrees/src/rules/` — trigger dispatcher (subscribes to `worktree_events` + `task_events`); condition DSL (pure-function predicates over task/worktree/review/artifact); action registry (`action_kind` → handler).
  - **Skills:** `compound-engineering:review:adversarial-reviewer` pre-merge (rule engine + Turing-completeness footgun risk; infinite-loop construction attempts), `compound-engineering:review:performance-reviewer` (dispatcher is hot path).
- **5.3** Built-in triggers: `state_category_changed`, `artifact_finalized`, `review_approved`, `review_rejected`, `task_created`, `dependency_resolved`, `schedule_cron`.
- **5.4** Built-in actions: `merge`, `discard`, `spawn_review`, `set_state`, `set_label`, `emit_event`. (Script actions + spawn_agent_run in PR 6.)
- **5.5** Rule authoring: YAML format (decided upfront — see §Open Questions #9 resolution) in `config/rules/*.yaml` auto-loaded at startup into `rules` table; runtime edits via `fulcrum rules create|update|disable <id>`.
- **5.6** **Authorship gate (HARD — per Finding C2).** `fulcrum rules create|update|enable` and the YAML loader reject entries whose caller is not `chief_of_staff`. `rules.author_agent_id` records the authoring agent. **Action-level ceiling:** the `spawn_agent_run` action handler (PR 6) additionally checks that the target role is NOT higher in the privilege hierarchy than `rules.author_agent_id`'s role — preventing a lower-privilege rule from escalating via a chain of rules. Policy rule ID: `rules.authorship_gate`.
- **5.7** **Event-namespace ACL (HARD — per Finding M10).** A rule's `trigger_spec_json.event_namespace` is validated at rule creation:
  - `fulcrum.worktree.*` and `fulcrum.task.*` — allowed for all `chief_of_staff`-authored rules.
  - `fulcrum.l0.*`, `fulcrum.l1.*`, `fulcrum.curator.*` — require an additional `chief_of_staff + memory_scope_approved` capability (explicit attribute on the authoring agent; not a new role, just a capability flag on existing `chief_of_staff` rows).
  - `fulcrum.rule.*` (meta — rules firing on rule runs) — forbidden in v2.0 (prevents trivial infinite loops; deferred to v2.1 with an explicit cycle-detection design).
  - Enforced in the YAML loader and `fulcrum rules create`.
- **5.8** **Cycle detection** (per Finding F2 — same-event dedup is insufficient): the trigger dispatcher tracks `(source_event_id, rule_id)` chains; if a rule's action emits an event that would re-fire the same rule (directly or via a 5-hop chain), the chain is aborted, logged to `rule_runs.status='cycle_aborted'`, and a `Review` is spawned for the authoring agent. Default max chain depth: 10.
- **5.9** **Condition DSL uses helpers, not raw comparisons** (per Finding F7). Conditions expose `canMerge(caller)`, `isRole(agent, role)`, `hasOpenBlocks(task)` etc. — the same helpers used by `packages/core/src/roles.ts`. Raw string-equality on role names is rejected at rule creation; `role-string-guard.test.ts` enforces this for the DSL too.
- **5.10** **Port the existing merge-queue gate to a seed rule:** `trigger=state_category_changed(started → completed) condition=canMerge(caller) action=merge`. `processMergeQueue` becomes a no-op wrapper around this rule for back-compat.
- **5.11** Observability: `fulcrum rules runs --rule <id>` lists `rule_runs` with timing; failing rules flag to monitor. Rule authors see their own runs; `chief_of_staff` sees all runs.

**PR 5 splits into 5a and 5b to fit the diff budget** (per Finding H5):
- **PR 5a — Rule engine core + authoring gate + ACL (units 5.1 / 5.2 / 5.3 / 5.5 / 5.6 / 5.7 / 5.8 / 5.9).** Ships the trigger dispatcher, condition DSL, authorship + namespace gates, cycle detection. No `spawn_agent_run` action yet. Re-estimated from 5 days → 7 days.
- **PR 5b — Built-in actions + seed merge-queue rule + observability (units 5.4 / 5.10 / 5.11).** Ships `merge`, `discard`, `spawn_review`, `set_state`, `set_label`, `emit_event` action handlers and ports the merge-queue gate. Re-estimated 3 days.

**Verify (5a):** rule authored by `software_engineer` is rejected at creation; rule authored by `chief_of_staff` loads; cycle-detection integration test deliberately constructs a 3-rule cycle and confirms `cycle_aborted` status.
**Verify (5b):** merge-queue gate passes via the seed rule unchanged; a new YAML rule (`auto-discard dirty worktrees > 72h`) fires in an integration test.

### PR 6 — Script Actions + inbound webhooks

**Goal:** Rules can spawn agent runs and be triggered by arbitrary external POSTs.

**Units:**
- **6.1** `runMigration206WorktreesV2Webhooks` — `inbound_webhooks(webhook_id, name, secret_hash, created_at, active, allowed_rule_ids TEXT)`; `script_action_registry(kind, handler_module, config_schema_json)`; `webhook_replay_cache(signature_digest, received_at)` with a 5-minute retention + UNIQUE index (replay defense, per Finding F8).
- **6.2** `action_kind='spawn_agent_run'` handler — takes `{role, prompt_template, context_task_id}`, validates role against `role_transitions`, enforces the **action-level ceiling** from PR 5a (`target_role ≤ author_role`), spawns via existing `start_agent_run` path.
- **6.3** `action_kind='run_script'` — execute a named TypeScript handler from `script_action_registry`; handlers declared via `registerScriptAction(name, handler, schema)`; no eval/unrestricted JS.
- **6.4** Inbound webhook endpoint `/hook/inbound/<webhook_id>` — HMAC-SHA256 signature verification (`X-Fulcrum-Signature`); emits a `trigger_event` that rules subscribe to via `trigger_kind='inbound_webhook'`.
  - **Skills:** `agent-skills:security-and-hardening` (HMAC + replay defense + secret rotation), `agent-skills:source-driven-development` + `find-docs` (Node `crypto.timingSafeEqual` / HMAC best practice).
- **6.5** Security audit: `agent-skills:security-auditor` reviews token storage, HMAC verification, replay-attack protection (timestamp window).
  - **Skills:** `compound-engineering:review:security-reviewer` in addition to the auditor subagent (two-lens coverage — persona review + adversarial threat modeling).
- **6.6** CLI: `fulcrum webhooks create <name>` prints the secret once; `fulcrum webhooks rotate <id>` invalidates the old secret.
- **6.7** Shadow-path coverage (per Finding F8): empty body → 400, replay within 5-minute window → 409 Conflict, webhook whose `allowed_rule_ids` references a disabled/deleted rule → 200 with `fired_rules: []` but audit log entry.

**Verify:** a rule triggered by an inbound webhook spawns a `software_engineer` agent run end-to-end; bad-HMAC request rejected with 401; replay of a prior-valid signature within 5 min returns 409.

### PR 7 — Stacked worktrees + hierarchical capability

**Goal:** Agent B builds on Agent A's in-flight worktree.

**Units:**
- **7.1** `runMigration207WorktreesV2Stacks` — `worktrees.parent_worktree_id TEXT REFERENCES worktrees(worktree_id)`; partial index; `worktrees.parent_trunk TEXT` (per-project trunk branch name — resolves the "what is trunk in a multi-repo workspace?" gap from Finding M6); `worktrees.rebase_agent_run_id TEXT` (which agent run owns the rebase).
- **7.2** `allocateWorktree({parent_worktree_id})` — base_branch becomes parent's branch; `parent_trunk` set from the project's configured trunk (`projects.default_branch`, defaulting to `main`); validates parent not in terminal state.
- **7.3** Post-merge hook: for each child of a merged worktree, enqueue a `rebaseChild` *agent task* (not a direct git call). An agent run owns the rebase — its `run_id` goes into `worktrees.rebase_agent_run_id` so the rebase has a principal, can be retried, and shows up in the event timeline. Children in `dirty` state are parked in a new `status='awaiting_parent_rebase'` (category `started`) until they reach `ready_for_merge`, at which point they auto-enqueue.
  - **Skills:** `agent-skills:debugging-and-error-recovery` (cascade semantics surface novel failure modes; expect to iterate), `Architecture Reviewer` (subagent — stacked-worktree state machine is architecturally novel for this repo).
- **7.4** **Hierarchical capability (not a new role — per Finding M5).** Instead of a new `lead_engineer` role, introduce a capability flag on existing `software_engineer` (and other implementation roles): `can_allocate_child_worktrees: true`. Enforced in `allocateWorktree` via the existing capability helper pattern (`roles.ts`). When a concrete use case for a distinct `lead_engineer` identity surfaces, promote to role; until then, capability is enough.
- **7.5** Cascade semantics: parent `conflict` → children `status='blocked_by_parent'` (new state in category `started`); parent `discarded` → children cascade-discard; parent `awaiting_parent_rebase` leaf children reap on the same TTL as `dirty` (via existing `cleanupAbandonedWorktrees` janitor — see `packages/core/src/janitor.ts:243`). TTL respects parent liveness: if the parent heartbeat is fresh, children do NOT reap.
- **7.6** Integration test corpus: 3-level parent/child/grandchild; parent conflict; parent discard; child merging before parent (rejected); child rebase after parent merge (happy path); janitor-respects-parent-heartbeat.

**Verify:** real-git integration test, not mocks. Time budget: test corpus alone consumes ~2 days; PR 7 re-estimated from 3 days → 5 days (per Finding H6).

### PR 8 — Batched speculative merge queue + bisection

**Goal:** N parallel completions → log-N CI validations (not N).

**Units:**
- **8.1** `runMigration208WorktreesV2MergeBatches` — `worktree_merge_batches(batch_id, status, size, strategy, parent_trunk_sha, merged_ref, created_at)`; `worktrees.batch_id` FK.
- **8.2** `packages/worktrees/src/merge-batch.ts` — `assembleBatch(candidates, max_size)`, `validateBatch(batch)`, `bisectBatch(batch)` pure functions.
- **8.3** Wire into the `merge` rule action: assemble batch, emit `fulcrum.merge_candidate` with batch ref, wait for `fulcrum.merge_candidate_result` (`batch_validation_timeout_ms` default 600s) OR skip external gate when `FULCRUM_MERGE_CANDIDATE_GATE_DISABLED=1`; apply as single FF commit on pass; bisect + re-queue survivors on fail.
  - **Skills:** `agent-skills:performance-optimization` (batch size + parallelism + CI timeout tuning), `compound-engineering:review:performance-reviewer` pre-merge.
- **8.4** Binary bisection; singletons that still fail are the culprits and evicted (marked `conflict`); others re-queue at original positions.
  - **Skills:** `compound-engineering:ce-optimize` (empirical validation of bisection strategy vs linear split; decide open question #4 with data, not vibes).
- **8.5** Metrics on `worktree_merge_batches`: size histogram, bisection depth, latency.
- **8.6** Non-batched fallback via `FULCRUM_MERGE_BATCH_SIZE=1` — behaves exactly as v1 FIFO.

**Verify:** stress test — 20 ready worktrees, 2 conflict with trunk, converge in ≤log₂(20) validations; no healthy worktree evicted.

### PR 9 — Remote-PR projection (GitHub first)

**Goal:** Opt-in — `markReady` opens a GitHub PR; merge triggers `gh api` merge.

**Units:**
- **9.1** `runMigration209WorktreesV2RemotePRs` — `pull_requests(pr_id, worktree_id, host, external_id, url, status, created_at)`.
- **9.2** `packages/worktrees/src/pr-sync.ts` — thin `@octokit/rest` adapter; verify current API via `find-docs`. Functions: `publishPR`, `mergeRemotePR`, `syncPRStatus`.
  - **Skills:** `agent-skills:source-driven-development` + `find-docs` (Octokit surface changes frequently — verify auth flow + `pulls.merge` strategy enum against current docs before writing code), `agent-skills:security-and-hardening` (token storage + redacted error paths).
- **9.3** `markReady` hook: if `FULCRUM_REMOTE_PR_HOST=github` + `GITHUB_TOKEN` set, publish PR and write `pull_requests` row. Else no-op.
- **9.4** `merge` action post-commit hook: if remote PR exists, merge it via API (strategy configurable per project).
- **9.5** Retry + exponential backoff for transient GitHub errors (429, 5xx); stale PRs auto-close on `discardWorktree`.
- **9.6** Security review: token handling (never logged, masked in error output), scope (`repo` only), rate-limit surface.
- **9.7** Shadow-path coverage (per Finding F8): partial-failure handling (PR opens on GitHub but `pull_requests` INSERT fails → compensating `PATCH /pulls/:n` to close the orphan PR with "Fulcrum DB write failed, retry"); token-rotation mid-flight (reconstruct Octokit client when `GITHUB_TOKEN` env changes between calls); 422 on already-merged branch (swallow as success if target SHA matches expected ref); 404 on deleted branch (mark `pull_requests.status='orphaned'`, surface via monitor).

**Verify:** happy path against a test GitHub org; offline fallback works when token unset; no PR published for non-git projects.

### PR 10 — Event timeline + `fulcrum worktree undo`

**Goal:** Every transition logged; repo-state replay.

**Units:**
- **10.1** `runMigration210WorktreesV2Events` — `worktree_events(event_id, worktree_id, event_type, payload_json, agent_id, occurred_at)` append-only; `worktree_undo_log(undo_id, worktree_id, snapshot_ref, compensating_sql, created_at)`.
- **10.2** Centralize `recordEvent` calls — every state transition, rule run, review action writes one row.
- **10.3** `fulcrum worktree timeline <worktree_id>` CLI chronological view.
- **10.4** `fulcrum worktree undo <worktree_id> --to-event <event_id>` reverse-applies events; each event type has a registered reverser; git-level compensations via `git reset --hard <snapshot_ref>`.
- **10.5** Role gate: `worktreeUndo` allowed for `integration_worker` only; other roles get `FORBIDDEN` with policy rule ID.
- **10.6** Tests: happy-path undo of premature merge; undo across a batch; undo past `discarded` returns error.

**Verify:** end-to-end `allocate → dirty → ready → merge → undo back to dirty`; git branch matches snapshot.

### PR 11 — Multi-repo BatchHandoff + virtual-lane file claims

**Goal:** One spec → N worktrees across N repos; parallel agents in the same worktree can claim non-overlapping files.

**Units:**
- **11.1** `runMigration211WorktreesV2BatchAndLanes` — `batch_handoffs(batch_id, goal, scope_spec_json, created_at)`, `task_fanout_children(batch_id, task_id, project_id, worktree_id, status)`, `file_claims(claim_id, worktree_id, project_id, file_path, hunk_range_json, acquired_at, released_at, holder_agent_id)` with UNIQUE partial index for coarse-file lock.
- **11.2** `createBatchHandoff({goal, scope_spec})` — `scope_spec` shaped after Sourcegraph Batch Changes (targets: repo filter, task template, artifact contract). Persists rows + spawns child tasks.
- **11.3** Aggregate status view `batchHandoffStatus(batch_id)`.
- **11.4** Safety: ≥10 children requires `--confirm`; MCP-tool equivalent requires `chief_of_staff`.
- **11.5** `claimFile`, `releaseFile`, `listActiveClaims` + hunk-range overlap arithmetic (per Finding M7).
  - **Semantics:** claims are **mandatory**, not advisory. `claimFile(file, hunk?)` returns `{ claim_id }` or throws `FILE_CLAIM_CONFLICT` with the holder's agent_id + hunk range. Enforcement is at `claimFile()` time only — callers are trusted to claim before writing (writes themselves are not gated; this is a cooperative protocol with a DB-backed invariant, matching the existing `advisory_locks` pattern).
  - **Overlap:** two hunks overlap if their `[start_line, end_line]` intervals intersect (closed intervals; `[10,20]` conflicts with `[20,30]` because line 20 overlaps). File-scope claim (`hunk_range_json IS NULL`) conflicts with any hunk claim on the same file.
  - **TTL:** `file_claims.acquired_at` + `file_claims.ttl_seconds` (default 3600); existing janitor (`cleanupExpiredLocks` pattern) reaps expired claims. Crashed-agent claims release automatically after TTL.
  - **Overlap check:** SQL predicate `NOT (new.end_line < existing.start_line OR new.start_line > existing.end_line)` filtered on same `(project_id, file_path)` + `released_at IS NULL` + `acquired_at + ttl_seconds > now`.
- **11.6** Auto-release on worktree terminal transition; janitor TTL sweep runs every 10 min (same cadence as existing `cleanupAbandonedWorktrees`).
- **11.7** Opt-in per project: `projects.lanes_enabled` flag.

**Verify:** scope spec targeting 3 projects creates 3 worktrees each reaching `ready_for_merge`; two agents attempting same file — second `claimFile` returns conflict with holder ID.

### PR 12 — SSE event stream + status endpoint

**Goal:** Live event stream for external consumers (CI, monitor dashboard). **Scope trimmed per Finding M3** — the rich UI timeline + Hill-chart visualization is deferred to v2.1. Gap 15 ("observable live event stream") is fully closed by the SSE + JSON endpoints alone.

**Units:**
- **12.1** Monitor-server SSE endpoint `/api/worktrees/events` tailing `FulcrumEventBus` (filtered to `fulcrum.worktree.*` + `fulcrum.task.*`).
- **12.2** JSON endpoint `/api/worktrees/status` — active worktrees + batches + conflicts + current iteration + rule-run summary.
- **12.3** (REMOVED — deferred to v2.1) Rich UI timeline + Hill-chart visualization.
- **12.4** Static HTML fallback (no JS, 10s refresh) reusing the existing monitor HTML surface — zero new UI surface area.
- **12.5** Zero coupling: monitor off → no degradation to CLI flows.

**Verify:** 4-agent parallel run — SSE emits all transitions within 1s, reconnects after network blip; `/api/worktrees/status` returns expected counts.

### PR 13 — DEFERRED to v2.1

**Status: deferred** (per Finding M4). GraphQL + HMAC-signed outbound webhooks for external consumers was originally PR 13 of v2. The deferral rationale:

- No current external consumer exists in v2 scope. CI bridging is covered by PR 6 inbound webhooks (which already use HMAC). Agent-facing access is covered by the existing MCP surface.
- Introducing a public GraphQL schema before a first consumer is framework-ahead-of-need — the schema shape cannot be validated without a real client.
- The `api_tokens` + `webhook_subscriptions` tables and the GraphQL server dependency (Open Question #11) would add three surfaces whose design is not yet pinned to a concrete use case.

**What moves to v2.1:**
- GraphQL schema generation over typed worktree/task/artifact/review/handoff/iteration/dependency/rule/rule_run objects.
- Outbound webhook subscriptions with HMAC signing + retry + DLQ.
- `api_tokens` with scoped permissions.
- The `runMigration212WorktreesV2PublicSurface` migration (number 212 stays reserved in the MASTER-PLAN registry for v2.1; not claimed until the v2.1 plan opens).

**What remains in v2 scope for external consumers:**
- SSE stream from PR 12.
- Inbound webhooks from PR 6.
- Existing MCP surface.

These three cover every use case the audit surfaced. A v2.1 plan opens when a concrete external consumer (e.g. a Slack integration, a cross-workspace query service) is ready to validate the SDL.

### PR 14 — Cutover + cleanup

**Goal:** Default-on for v2 capabilities; drop legacy transitional code.

**Units:**
- **14.1** `runMigration213WorktreesV2Cutover` — flip nullables to NOT NULL where appropriate (via SQLite table-rebuild); drop `artifact_contracts.required_artifacts` after confirming zero-row residue.
  - **Skills:** `compound-engineering:review:data-migration-expert` + `compound-engineering:review:schema-drift-detector` + `compound-engineering:review:deployment-verification-agent` (production data touched — Go/No-Go + SQL verify queries + rollback plan).
- **14.2** Flag flips: `FULCRUM_WORKTREES_V2_*` → on by default.
- **14.3** Remove legacy `processMergeQueue` implementation — fully replaced by the seed rule.
- **14.4** Update `docs/guides/worktrees.md` to v2 defaults.
- **14.5** Update `AGENTS.md` + `agent-integration/claude/CLAUDE.md` worktrees section.
- **14.6** Remove `FULCRUM_WORKTREES_V2_*` flag strings from code.

**Verify:** full test suite green; `fulcrum worktree *` CLI output matches updated docs; no `FULCRUM_WORKTREES_V2_` string in `packages/**`.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rule engine becomes a Turing-complete footgun | Condition DSL is pure (no I/O); actions constrained to a registered set; YAML-first authoring + CLI CRUD; infinite-loop detection via `rule_runs.trigger_event_id` deduplication |
| Migrating existing `ArtifactContract` rows corrupts data | PR 2 does row-level migration in a transaction; dry-run CLI + diff output; back-compat view until PR 14 cutover |
| Batched MQ head-of-line blocking when one CI is slow | `batch_validation_timeout_ms` default 600s; automatic bisection on timeout |
| Stacked worktrees create unexpected rebase storms | `rebaseChild` idempotent + rate-limited in merge post-hook |
| GitHub token leakage | Security review + never-log redaction; follow Octokit best practices (`find-docs`-verified) |
| Undo miss side effects (vault writes, memory writes) | Undo scoped to worktree state only; git-level compensations via `git reset --hard`; docs call out that memory/vault writes are not reversed |
| BatchHandoff over-spawns tasks | CLI `--confirm` + MCP `chief_of_staff` gate; `scope_spec.targets.max_children` cap default 25 |
| File-claim deadlock in high-concurrency non-git projects | Claim queries log chain; PR 11.5 returns holder info so callers can wait/abort |
| SSE overwhelms browsers on long runs | Tail last 500 events server-side; pagination for older |
| GraphQL API surface grows faster than agent-native MCP | MCP stays primary; GraphQL is external-consumer-only (AD-13); no new features added GraphQL-first |

---

## Open Questions (track in `-plan-review.md` as we hit them)

1. **Rule-engine schema version:** how do we handle rule-DSL drift? Proposal: `rules.version` + "downconverter" read path, same as memory-v3 page schema.
2. **`ajv` vs. a lighter schema validator (PR 2):** verify via `find-docs` before committing to `ajv`; it's ~120 KB and drags in a lot of JSON-schema machinery. Candidates: `zod`, `typebox`, hand-rolled.
3. **Hunk-range claim granularity (PR 11):** line-range first; AST-range (via tree-sitter) deferred to v2.1 unless contention data demands it.
4. **Bisection strategy (PR 8):** binary split; linear split (single-evict) is an option Mergify supports — revisit after real batch-size data.
5. **Remote-PR host abstraction (PR 9):** GitHub-first; GitLab/Gitea/Bitbucket deferred until a user asks. Do not preemptively abstract.
6. **Event-log retention (PR 10):** proposal 90 days or 1000 events per worktree (whichever is larger); tunable via `FULCRUM_WORKTREE_EVENT_RETENTION_DAYS`.
7. **Hierarchical delegation depth (PR 7):** start with 2 levels (`chief_of_staff` → `lead_engineer` → specialist). `lead_engineer`-spawns-`lead_engineer` deferred until a user need surfaces.
8. **Iteration rollover strategy (PR 4):** default = roll all incomplete tasks into next iteration. Alternatives (drop, archive) exposed as `iterations.rollover_strategy`.
9. **Rule-engine YAML format:** modeled on GitHub Actions (familiar) vs. Jira Automation (natural for trigger/condition/action) — decide in PR 5.
10. **GraphQL server choice (PR 13):** `graphql-yoga` vs. `apollo-server` vs. `mercurius` — decide via `find-docs` on maintenance + bundle size.

---

## Timeline Estimate

Re-estimated per Finding H6 — explicit review-matrix cost factored in, scope cuts (PR 12 UI removed, PR 13 deferred) applied, PR 5 split into 5a/5b, PR 7 test-corpus cost included.

One engineer, focused, no heavy blockers:

| PR | Effort | Notes |
|---|---|---|
| 1 | 2 days | |
| 2 | 3 days | Includes validator-library decision (OQ #2) |
| 3 | 4 days | |
| 4 | 3 days | |
| 5a | 7 days | Rule engine core + authorship gate + ACL + cycle detection |
| 5b | 3 days | Built-in actions + seed merge rule |
| 6 | 3 days | |
| 7 | 5 days | Integration test corpus alone is ~2 days |
| 8 | 4 days | |
| 9 | 3 days | |
| 10 | 3 days | |
| 11 | 4 days | |
| 12 | 2 days | SSE + JSON endpoints only; UI deferred to v2.1 |
| 13 | 0 days | **DEFERRED to v2.1** |
| 14 | 1 day | |

Base: ~47 focused days ≈ 10 weeks. Review-matrix cost (~1 hour each across 5-axis + persona panel + adversarial + security auditor + data-integrity guardian on ~10 PRs): ~10 additional days = ~2 weeks. **Realistic total: 12 weeks focused + 3 weeks buffer for regressions + OQ decisions = ~15 calendar weeks.** Every PR ships an independently valuable increment — nothing waits on the full chain.

---

## Approval Checklist (before PR 1 lands)

- [ ] User approves the 14-PR breakdown + ordering (PM-flow first, orchestration second)
- [ ] User confirms the "NOT adopting" list (story points, WYSIWYG rules, user notifications, Gantt, sprint ceremonies, virtual-branches-as-default, per-edit auto-commit, default Docker sandbox, GroupChat handoff, GitHub-issue-as-state-store)
- [ ] User confirms migration number block `201..213` is acceptable
- [ ] User confirms default-off flag strategy through PR 13 + default-on flip in PR 14
- [ ] User decides Open Question #2 (validator library: ajv vs. zod vs. typebox vs. hand-rolled)
- [ ] User decides Open Question #5 (remote-PR host: GitHub-first acceptable?)
- [ ] User decides Open Question #7 (hierarchical depth: 2 levels initially?)
- [ ] User decides whether to update MASTER-PLAN.md to index this plan + memory-v3 (coordination layer across subsystems)

All checked — PR 1 is unblocked.

---

## Sources

### PM-flow research pass (2026-04-18)

- [Jira automation triggers](https://support.atlassian.com/cloud-automation/docs/jira-automation-triggers/)
- [Jira automation actions](https://support.atlassian.com/cloud-automation/docs/jira-automation-actions/)
- [Create/edit Jira automation rules](https://support.atlassian.com/cloud-automation/docs/create-and-edit-jira-automation-rules/)
- [Jira Automation in 2026 (Cotera)](https://cotera.co/articles/jira-automation-guide)
- [8 steps to Definition of Done in Jira](https://www.atlassian.com/blog/jira/8-steps-to-a-definition-of-done-in-jira)
- [Fields Required Precondition (JSU)](https://beecom-products.atlassian.net/wiki/spaces/JSUCLOUD/pages/27801810/Fields+Required+Precondition)
- [Linear developer GraphQL](https://linear.app/developers/graphql)
- [Linear webhooks](https://linear.app/developers/webhooks)
- [Linear GraphQL schema (SDK)](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)
- [Linear webhooks guide (InventiveHQ 2025)](https://inventivehq.com/blog/linear-webhooks-guide)
- [Asana Rules API](https://developers.asana.com/reference/rules)
- [Asana app components on rules](https://developers.asana.com/docs/app-components-on-rules)
- [Asana Script Actions](https://developers.asana.com/docs/script-actions)
- [Asana incoming web requests](https://developers.asana.com/docs/incoming-web-requests)
- [GitHub Projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Automating GitHub Projects using Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions)
- [Managing a GitHub merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub merge queue velocity (Apr 2026)](https://humanwhocodes.com/blog/2026/04/improving-developer-velocity-github-merge-queue/)
- [Plane — makeplane/plane](https://github.com/makeplane/plane)
- [Plane API](https://developers.plane.so/api-reference/introduction)
- [Plane vs OpenProject (2026)](https://plane.so/blog/plane-vs-openproject-which-should-you-choose-in-2026)
- [OpenProject work-package workflows](https://www.openproject.org/docs/system-admin-guide/manage-work-packages/work-package-workflows/)
- [OpenProject Work Packages API](https://www.openproject.org/docs/api/endpoints/work-packages/)
- [OpenProject Custom Actions (Enterprise)](https://www.openproject.org/docs/system-admin-guide/manage-work-packages/custom-actions/)
- [Taiga REST API](https://docs.taiga.io/api.html)
- [Taiga enhanced swim-lanes](https://community.taiga.io/t/enhanced-swimlane-functionality/2720)
- [Huly Platform — hcengineering/platform](https://github.com/hcengineering/platform)
- [Huly.io](https://huly.io/)
- [Leantime — Leantime/leantime](https://github.com/Leantime/leantime)
- [Leantime licensing AGPLv3](https://support.leantime.io/en/article/how-is-leantime-the-open-source-system-licensed-29l3j/)
- [Redmine REST Issues](https://www.redmine.org/projects/redmine/wiki/Rest_Issues)
- [Redmine role-based field visibility (5037)](https://www.redmine.org/issues/5037)
- [Redmine required fields per tracker/status/role (703)](https://www.redmine.org/issues/703)
- [Focalboard — mattermost-community/focalboard](https://github.com/mattermost-community/focalboard)
- [Focalboard automation engine req (347)](https://github.com/mattermost-community/focalboard/issues/347)
- [Shortcut REST API v3](https://developer.shortcut.com/api/rest/v3)
- [Shortcut Epic Workflow States](https://help.shortcut.com/hc/en-us/articles/360046059412-Epic-Workflow-States)
- [GitLab Epics](https://docs.gitlab.com/user/group/epics/)
- [GitLab Milestones](https://docs.gitlab.com/user/project/milestones/)
- [GitLab Issues API](https://docs.gitlab.com/api/issues/)
- [GitLab Work Items](https://docs.gitlab.com/user/work_items/)
- [ClickUp Tasks API](https://developer.clickup.com/docs/tasks)
- [ClickUp custom fields in Automations](https://help.clickup.com/hc/en-us/articles/35446142759575-Use-Custom-Fields-in-Automations)
- [ClickUp Automations](https://clickup.com/features/automations)
- [Azure DevOps workflow + state categories](https://learn.microsoft.com/en-us/azure/devops/boards/work-items/workflow-and-state-categories?view=azure-devops)
- [Azure DevOps default rule reference](https://learn.microsoft.com/en-us/azure/devops/organizations/settings/work/rule-reference?view=azure-devops)
- [Azure DevOps inherited process work-item customization](https://learn.microsoft.com/en-us/azure/devops/organizations/settings/work/customize-process-work-item-type?view=azure-devops)
- [Basecamp Hill Charts](https://basecamp.com/hill-charts)
- [Vikunja features](https://vikunja.io/features/)
- [Kanboard vs Wekan (SourceForge)](https://sourceforge.net/software/compare/Kanboard-vs-Wekan/)

### Agent/git-orchestration research pass (2026-04-18)

- [Conductor.build](https://www.conductor.build/)
- [ryanmac/code-conductor](https://github.com/ryanmac/code-conductor)
- [johannesjo/parallel-code](https://github.com/johannesjo/parallel-code)
- [GitButler virtual branches](https://docs.gitbutler.com/features/branch-management/virtual-branches)
- [GitButler stacked branches](https://docs.gitbutler.com/features/branch-management/stacked-branches)
- [GitButler Butler Flow](https://docs.gitbutler.com/butler-flow)
- [git-town basic commands](https://www.git-town.com/basic-commands.html)
- [git-town GitHub](https://github.com/git-town/git-town)
- [git-spice](https://abhinav.github.io/git-spice/)
- [git-spice GitHub](https://github.com/abhinav/git-spice)
- [git-branchless](https://github.com/arxanas/git-branchless)
- [git-branchless undo wiki](https://github.com/arxanas/git-branchless/wiki/Command:-git-undo)
- [git-branchless smartlog wiki](https://github.com/arxanas/git-branchless/wiki/Command:-git-smartlog)
- [OpenHands paper](https://arxiv.org/abs/2407.16741)
- [OpenHands V1 SDK paper](https://arxiv.org/html/2511.03690v1)
- [SWE-agent paper](https://arxiv.org/abs/2405.15793)
- [SWE-agent GitHub](https://github.com/SWE-agent/SWE-agent)
- [Aider git integration](https://aider.chat/docs/git.html)
- [MetaGPT paper](https://arxiv.org/html/2308.00352v6)
- [IBM MetaGPT overview](https://www.ibm.com/think/topics/metagpt)
- [CrewAI vs AutoGen (arsum)](https://arsum.com/blog/posts/autogen-vs-crewai/)
- [CrewAI vs AutoGen (ZenML)](https://www.zenml.io/blog/crewai-vs-autogen)
- [Graphite merge queue docs](https://graphite.com/docs/graphite-merge-queue)
- [Graphite stack-aware MQ](https://graphite.com/blog/the-first-stack-aware-merge-queue)
- [Mergify queue rules](https://docs.mergify.com/merge-queue/rules/)
- [Mergify batches](https://docs.mergify.com/merge-queue/batches/)
- [Mergify merge-batch 2026-04](https://docs.mergify.com/changelog/2026-04-07-new-merge-batch-merge-method-for-merge-queue/)
- [Cognition Devin 2.0](https://cognition.ai/blog/devin-2)
- [Cognition Devin manages Devins](https://cognition.ai/blog/devin-can-now-manage-devins)
- [Factory.ai](https://factory.ai/)
- [Factory.ai guide (Bharath)](https://www.siddharthbharath.com/factory-ai-guide/)
- [Sourcegraph Batch Changes](https://sourcegraph.com/docs/batch-changes)
- [Sourcegraph Batch Changes examples](https://github.com/sourcegraph/batch-change-examples)
