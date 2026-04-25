<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- template principle 1 -> I. Local-First Core
- template principle 2 -> II. Operator Control And Human Review
- template principle 3 -> III. Canonical Local State
- template principle 4 -> IV. Explainable Evidence And Provenance
- template principle 5 -> V. Minimum Reinvention And Replaceable Adapters
Added principles:
- VI. Security, Privacy, And Policy Gates
- VII. Incremental Delivery And Quality Gates
- VIII. TypeScript-First Boundary Discipline
Added sections:
- Product Boundaries
- Delivery Workflow And Review Process
Removed sections:
- None
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- not present: .specify/templates/commands/
Follow-up TODOs:
- None
-->

# Fulcrum CLI Agent OS Constitution

## Core Principles

### I. Local-First Core

Fulcrum MUST run its core workflows on a normal developer machine without
requiring cloud services, hosted project management systems, remote databases,
remote model providers, or remote telemetry. Core workflows include setup,
doctor, project registry, task/run visibility, context building from local
sources, worktree delivery, artifact capture, backup, restore, export, reset,
rebuild, and uninstall.

Remote services MAY be supported only as opt-in integrations with visible
health, privacy, offline behavior, and disablement status. Missing optional
integrations MUST degrade to explicit local states instead of breaking local
execution. Any feature that requires network access MUST declare that
requirement in the specification and MUST provide a local fallback or justify
why the feature is explicitly integration-only.

Rationale: Fulcrum's product identity is an operator-owned local agent OS, not
a SaaS control plane or online project management wrapper.

### II. Operator Control And Human Review

Fulcrum MUST keep one human operator in control of what runs, what changes,
what is remembered, what is posted to external systems, what is merged, and
what is deleted. Agent work MUST be visible as task-linked runs with status,
heartbeat, context pack reference, worktree reference, artifacts, quality-gate
results, policy decisions, and final outcome.

Destructive or externally visible actions MUST require policy approval unless
the operator has configured an explicit bypass for the project and action type.
Dangerous actions include deleting worktrees, cleaning untracked files, running
arbitrary shell commands, writing permanent memory, changing external project
management status, posting external comments, merging branches, purging
backups, and exporting sensitive data. Fulcrum MUST never silently overwrite,
delete, or hide user work.

Rationale: Fulcrum exists to supervise agent leverage, not to move authority
from the operator into opaque automation.

### III. Canonical Local State

Fulcrum MUST own canonical local state for projects, task mirrors, local-only
tasks, runs, run events, worktree allocations, context packs, artifacts,
quality-gate results, policy decisions, setup state, health status, adapter
configuration, sync/writeback records, backups, and exports.

Derived data, including search indexes, vectors, graph projections, rankings,
repo maps, context previews, and cache files, MUST be rebuildable from
canonical state or documented source systems. External systems MAY be canonical
for their own domains, such as Git repository content or Plane issue text, but
they MUST NOT become hidden sources of truth for Fulcrum run execution,
worktree lifecycle, policy decisions, or artifact provenance. Every long-running
operation MUST have truthful status, and every run MUST reach at most one
terminal state.

Rationale: Durable local state is required for crash recovery, auditability,
backup, restore, uninstall safety, and cross-surface consistency.

### IV. Explainable Evidence And Provenance

Fulcrum MUST make important outputs explainable. Context packs, memory recall,
code search results, graph links, task decisions, policy decisions, quality
gate outcomes, and agent-visible prompts MUST include source references,
timestamps or freshness signals, inclusion reasons, confidence or limitations
where relevant, and linked task/run/artifact identifiers.

Exact code evidence MUST remain distinguishable from semantic or ranked
evidence. Memory entries MUST cite raw sources or explicitly declare when a
source is unavailable. Stale, missing, blocked, degraded, or omitted evidence
MUST be visible to operators and agents. Agents MUST be able to inspect why a
context item was included before relying on it.

Rationale: Operators can only trust Fulcrum if answers, actions, and context
are traceable back to evidence.

### V. Minimum Reinvention And Replaceable Adapters

Fulcrum MUST prefer mature local tools, open protocols, and replaceable
adapters where they satisfy the product requirement. Fulcrum SHOULD integrate
tools such as Git, SQLite, ripgrep, fd, ast-grep, repo-map generators, memory
backends, local process supervisors, MCP-capable agents, and optional project
management systems rather than rebuilding those mature domains.

Custom Fulcrum code MUST focus on product-owned semantics: local canonical
state, run lifecycle, worktree lifecycle, context-pack assembly, artifact
capture, policy checks, doctor status, quality gates, adapter orchestration,
and sync/writeback. A new custom engine, framework, graph database, vector
store, project management replacement, or agent framework MUST be justified by
a concrete requirement that cannot be met with an adapter. Every adapter MUST
define ownership boundaries, health checks, offline behavior, disablement
behavior, and import/export or rebuild strategy.

Rationale: Fulcrum spends custom code on the local operating layer that only
Fulcrum can own.

### VI. Security, Privacy, And Policy Gates

Fulcrum MUST default to no remote telemetry, no remote model calls, no online
project management sync, no hidden network access in core workflows, and
loopback-only local service binding. Remote endpoints, telemetry exporters,
hosted models, external project management, and cloud tracing MUST be explicit
operator opt-ins with visible privacy status.

Secrets, credentials, tokens, private keys, ignored files, and sensitive local
paths MUST be excluded from indexing, context packs, logs, traces, artifacts,
and reports where technically possible. Logs and events MUST redact sensitive
values. Features that cross trust boundaries MUST specify credential storage,
redaction, data shared externally, failure behavior, and operator approval
requirements before implementation. Policy gates MUST be tested for all
dangerous MCP tools, CLI commands, and cockpit actions.

Rationale: A local agent OS coordinates powerful tools over private source
trees; privacy and policy failures are product failures.

### VII. Incremental Delivery And Quality Gates

Fulcrum MUST deliver in independently testable increments tied to operator
value. Each feature specification MUST define user stories, independent tests,
edge cases, success criteria, and degraded states. Each implementation plan
MUST pass the Constitution Check before research and again after design.

Quality gates MUST provide evidence before readiness claims. Applicable gates
include unit tests, contract tests, integration tests, quickstart validation,
doctor output, policy-gate tests, worktree safety tests, crash/restart tests,
backup/restore tests, privacy/no-network checks, secret-redaction checks, and
adapter degradation tests. A feature MUST NOT be marked complete until its
primary operator workflow, machine-readable output, evidence/provenance path,
and recovery path are verified. Operator release exceptions may be recorded for
individual blocked runs, but they MUST remain visible as exceptions and MUST NOT
satisfy full-product completion. A full-product delivery specification MUST NOT
mark pilot, prototype, placeholder, or preview-only behavior as complete.

Rationale: Fulcrum proves local value and safety slice by slice instead of
accumulating unverified infrastructure.

### VIII. TypeScript-First Boundary Discipline

Fulcrum MUST use a TypeScript-first monorepo for the local API server, MCP
server, CLI, cockpit UI, shared schemas, adapter wrappers, context builder,
doctor, and SQLite state layer unless a feature plan documents a measured
reason to use another language. TypeScript code MUST be portable across Node.js
and Bun until packaging, subprocess handling, SQLite behavior, and long-running
process reliability are proven for the chosen runtime.

The TypeScript-first decision MUST NOT collapse product boundaries. Core domain
logic MUST NOT depend on React or cockpit UI state. MCP tools, CLI commands,
and cockpit actions MUST call shared core services rather than duplicating
behavior. Adapters MUST remain replaceable behind explicit interfaces. SQLite
schema and migrations MUST be explicit and reviewable. Go remains an escape
hatch only for proven failures in reliable process supervision, packaging,
memory use, filesystem safety, long-running daemon reliability, or
single-binary distribution.

Rationale: The final SRS amendment makes Fulcrum cockpit-first, so one
TypeScript type system across UI, API, MCP, CLI, and agent-facing JSON reduces
delivery risk while preserving a Go escape hatch.

## Product Boundaries

Fulcrum is a local-first CLI Agent OS for one developer/operator working across
many repositories and many CLI agents. It combines a local project/task
cockpit, live agent operations center, memory and code intelligence, context
builder, worktree delivery system, setup doctor, and recovery tools.

Fulcrum MUST expose the same canonical state through CLI, local cockpit UI,
terminal dashboard/TUI, machine-readable JSON/JSONL, MCP tools, and local
health reports. Cross-surface disagreement is a defect unless one surface
explicitly marks data as stale, partial, or degraded.

Fulcrum MUST NOT require a hosted multi-user service, enterprise project management administration, a plugin marketplace, cloud-only orchestration,
PDF/Office parsing, a hard dependency on a single project management tool,
remote model provider, vector database, graph database, workflow engine, code
search engine, or CLI-agent-specific deep integration.

## Delivery Workflow And Review Process

Every feature MUST begin with a specification that identifies operator value,
local/offline behavior, canonical state changes, evidence/provenance needs,
security/privacy implications, adapter boundaries, quality gates, and degraded
states. Every plan MUST define real repository paths, TypeScript package
boundaries, shared schemas, persistence changes, adapter contracts, recovery
behavior, and validation commands.

Tasks MUST be organized by independently testable user story. Foundational work
MUST be limited to prerequisites that unblock user stories. Each story MUST
include implementation tasks, tests or validation tasks, provenance updates,
policy/security gates where relevant, doctor/degraded-state updates, and
documentation or quickstart updates when user-visible behavior changes.

Reviews MUST check this constitution before implementation starts and before a
feature is marked complete. Review evidence MUST include local command output
or explicit notes for any gate that could not be run.

## Governance

This constitution supersedes conflicting project habits, generated templates,
and prior implementation assumptions. Product requirements and SRS amendments
MAY refine details, but they MUST NOT override these principles without a
constitution amendment.

Amendments MUST include:

- the changed principle or section;
- rationale tied to product requirements or implementation evidence;
- migration impact for existing specs, plans, tasks, code, adapters, and docs;
- template propagation notes;
- a semantic version bump.

Versioning policy:

- MAJOR: removes or redefines a core principle, changes product identity, or
  makes existing compliant specs non-compliant.
- MINOR: adds a principle, expands governance, or adds new mandatory gates.
- PATCH: clarifies wording without changing compliance obligations.

Compliance review is mandatory at these points:

- feature specification completion;
- implementation plan completion;
- task generation;
- pre-implementation review;
- pre-release or feature completion review.

If a plan violates the constitution, the plan MUST either be changed or record
the violation, operator-visible tradeoff, simpler alternative rejected, and
approval requirement. Unapproved violations block implementation.

**Version**: 1.0.0 | **Ratified**: 2026-04-24 | **Last Amended**: 2026-04-24
