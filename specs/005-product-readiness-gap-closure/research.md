# Research: Product Readiness Gap Closure

## Decision: Treat 004 as baseline, not proof

**Rationale**: 004 implemented broad surfaces and tests, but Product/SRS review found partial areas: packaging, SQLite canonical state, full doctor matrix, real-agent acceptance, adapter certification, cockpit depth, graph/cache correctness, and evidence-driven release readiness.

**Alternatives considered**:

- Edit 004 tasks in place: rejected because it hides historical completion evidence.
- Start over: rejected because useful code exists.

## Decision: Source-order compliance matrix

**Rationale**: Product/SRS files conflict. A stable source-order matrix prevents ambiguous "done" states and documents superseded requirements.

**Alternatives considered**:

- Human-only review: too easy to drift.
- Single source rewrite first: useful later, but current need is runnable closure workflow.

## Decision: SQLite cutover before deeper surface work

**Rationale**: Cross-surface parity, backup/restore, release evidence, and cockpit operations depend on one canonical local store. File-backed work state must become mirror/export only.

**Alternatives considered**:

- Keep JSON as canonical: conflicts with Product/SRS.
- Dual-write indefinitely: creates split-brain risk.

## Decision: Real-agent acceptance with guided degradation

**Rationale**: Product requires real CLI agent orchestration, but operators may not have every agent installed. Acceptance should prove at least two configured real agents while doctor guides missing ones.

**Alternatives considered**:

- Deterministic-only validation: explicitly insufficient.
- Require all agent brands: too brittle and violates optional adapter rules.

## Decision: One release-readiness evidence workflow

**Rationale**: Operator needs one command/script to know readiness. It must fail on missing, partial, mock-only, preview-only, or doc-only behavior and collect artifacts for review.

**Alternatives considered**:

- Separate manual commands: error-prone.
- CI-only proof: not enough for local product readiness.
