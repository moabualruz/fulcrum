# Document Review: Fulcrum RAG Roadmap Delivery

## Pass 1 - Initial Specification Review

**Document**: [spec.md](./spec.md)
**Mode**: headless
**Reviewing with**:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- product-lens-reviewer - roadmap scope and sequencing affect system trajectory
- security-lens-reviewer - destructive repair operations, provider truth, traces, and logs have trust-boundary impact
- scope-guardian-reviewer - spec has many requirements across priority tiers
- adversarial-document-reviewer - spec has more than 10 requirements and major architectural decisions

### Applied Auto-Fixes

- **Scope Boundaries**: Added explicit boundaries that P1 stabilizes current local RAG, optional runtimes remain gated experiments, hosted/multi-tenant answer UI is out of scope, and normal repair touches only allowlisted derived RAG state.
- **Health Terminology**: Added explicit RAG health statuses (`healthy`, `degraded`, `failed`, `out_of_scope`) and required reason/next-action behavior for non-healthy domains.
- **Eval Readiness**: Added requirement and success criterion that required live-eval domains with zero expected cases are degraded, not passing.
- **Security/Exposure**: Added authorization by actor capability and workspace/project scope before mutation. Added distinction between absolute operator preflight paths and non-secret path fingerprints for agent-facing traces/evals/memory.
- **Measurability**: Replaced "accepted ranking bound" in SC-005 with top 5 result bound.

### Findings Requiring Judgment

None after auto-fixes. Review complete.

## Pass 2 - Clarification Integration

**Skill**: speckit-clarify
**Mode**: headless per user instruction
**Questions answered**: 5

### Clarifications Applied

- Repair defaults to verify-and-fix derived-state differences; clean-slate rebuild requires explicit scope and preflight.
- P1 includes graph rebuild/coverage reporting; advanced relationship query modes remain P2.
- Required live-eval domains with zero expected cases produce degraded eval readiness.
- Optional runtime/store defaults require baseline comparison, rollback proof, local-first guarantees, and agent parity.
- Absolute paths are limited to operator preflight/report surfaces; agent-facing traces/evals/memory use path fingerprints.

### Coverage Summary

| Taxonomy Category | Status | Notes |
|---|---|---|
| Functional Scope & Behavior | Resolved | Repair default and optional-runtime boundaries encoded. |
| Domain & Data Model | Clear | Entities cover repair, coverage, result, graph, eval, trace, runtime truth. |
| Interaction & UX Flow | Clear | Operator/agent surfaces and preflight/report behavior specified. |
| Non-Functional Quality Attributes | Resolved | Eval readiness, path exposure, runtime truth, and gate behavior sharpened. |
| Integration & External Dependencies | Resolved | Optional runtimes/stores constrained by adapter and proof gates. |
| Edge Cases & Failure Handling | Resolved | Zero-case eval and clean-slate behavior covered. |
| Constraints & Tradeoffs | Resolved | P1/P2 graph split and baseline-first policy encoded. |
| Terminology & Consistency | Clear | Terminology section added during research enrichment. |
| Completion Signals | Clear | Success criteria include top-K, coverage, eval, trace, runtime truth. |
| Misc / Placeholders | Clear | No placeholders or clarification markers remain. |

## Pass 3 - Post-Clarification Specification Review

**Document**: [spec.md](./spec.md)
**Mode**: headless
**Reviewing with**:
- coherence-reviewer
- feasibility-reviewer
- product-lens-reviewer
- security-lens-reviewer
- scope-guardian-reviewer
- adversarial-document-reviewer

### Applied Auto-Fixes

None.

### Findings Requiring Judgment

None. The P1/P2 graph split, verify-and-fix repair default, eval zero-case behavior, optional runtime gates, and path exposure rules are now explicit and internally consistent.

Review complete.

## Pass 8 - Final Document Review

**Document**: spec, research, plan, data model, contracts, tasks, and checklists
**Mode**: headless
**Reviewing with**:
- coherence-reviewer
- feasibility-reviewer
- product-lens-reviewer
- security-lens-reviewer
- scope-guardian-reviewer
- adversarial-document-reviewer

### Applied Auto-Fixes

- **ID prefix drift in contract examples**: Updated existing rebuild and embedding examples from invented `ragrep_` / `embedjob_` prefixes to current `newId()` prefixes: `report_` and `job_`.

### Findings Requiring Judgment

None. Final artifacts align on scope, P1/P2/P3 sequencing, repair default, contextual index coverage, runtime truth, eval opt-in behavior, and agent-facing safety.

Review complete.

## Pass 7 - Analyze Remediation

**Skill**: speckit-analyze
**Mode**: read-only analysis followed by user-authorized no-pause remediation from workflow request

### Findings Applied

- **Contextual index coverage gap**: `spec.md` FR-016 and `plan.md` Slice 5 required contextual index text, but `tasks.md` had no implementation tasks. Added scaffold, tests, and implementation tasks for contextual index records, canonical-snippet behavior, and staleness.
- **Embedding runtime truth / next action gap**: `plan.md` Slice 2 required actual runtime truth and visible queued-job execution, but `tasks.md` lacked direct tests. Added tests and tasks for requested-vs-actual provider/model/device/dimensions, fail-closed mismatches, visible fallback, and `next_action` resume commands.
- **Eval opt-in gap**: `spec.md` FR-036 required model-heavy and accelerator-heavy evals to remain opt-in. Added tests and implementation tasks for opt-in gating across new eval suites.

### Result

Re-analysis after remediation: no critical or high consistency findings remain. Requirements now map to setup, foundation, user story, or polish tasks.

Review complete.

## Pass 6 - Tasks Review

**Document**: [tasks.md](./tasks.md)
**Mode**: headless
**Reviewing with**:
- coherence-reviewer
- feasibility-reviewer
- scope-guardian-reviewer
- security-lens-reviewer

### Applied Auto-Fixes

- **Bad documentation path**: Replaced missing `docs/guides/agent-tools.md` with existing `docs/guides/mcp-tools.md`.
- **Open validation artifact choice**: Replaced "script or documented command transcript" with a concrete quickstart validation command transcript task.

### Findings Requiring Judgment

None. Tasks are dependency-ordered, test-first, mapped to user stories, and include concrete repo paths.

Review complete.

## Pass 5 - Second Plan Pass Review

**Document**: [plan.md](./plan.md), [contracts/rag-roadmap-contracts.md](./contracts/rag-roadmap-contracts.md), [quickstart.md](./quickstart.md)
**Mode**: headless
**Reviewing with**:
- coherence-reviewer
- feasibility-reviewer
- scope-guardian-reviewer

### Applied Auto-Fixes

- **Embedding job execution path**: Replaced the open branch between a new `--run` flag and existing `jobs resume` with the existing `fulcrum jobs resume <job_id> --json` execution path plus a mandatory `next_action` from job creation when work is queued.

### Findings Requiring Judgment

None. The second plan pass now has no open tool-choice branches before task generation.

Review complete.

## Pass 4 - Plan Review

**Document**: [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/rag-roadmap-contracts.md](./contracts/rag-roadmap-contracts.md), [quickstart.md](./quickstart.md)
**Mode**: headless
**Reviewing with**:
- coherence-reviewer
- feasibility-reviewer
- product-lens-reviewer
- security-lens-reviewer
- scope-guardian-reviewer
- adversarial-document-reviewer

### Applied Auto-Fixes

- **Repair-plan action contract**: Replaced the open choice between extending `get_rag_health` and adding `get_rag_repair_plan` with one dedicated read-only `get_rag_repair_plan` tool. This avoids task-level branching and MCP/action drift.

### Findings Requiring Judgment

None. The plan stays within existing package ownership, sequences P1 before optional runtime work, and documents repair, retrieval, code RAG, graph, eval, trace, and safety contracts clearly enough for task generation.

Review complete.
