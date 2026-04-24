# Document Review: Fulcrum RAG Lifecycle Hardening

**Date**: 2026-04-22  
**Mode**: Headless review using document-review personas in main thread  
**Document**: `spec.md`

## Review Team

- Coherence reviewer: checked terminology, contradictions, and structure.
- Feasibility reviewer: checked implementation blockers, migration risk, and brownfield constraints.
- Scope guardian: checked scope size, priority boundaries, and abstraction load.
- Security lens: checked destructive command surface, logs, reports, and authorization.
- Adversarial reviewer: stress-tested assumptions and reversal costs.
- Product lens: checked operator value, cognitive load, and sequencing.

## Findings And Fixes

### F1: Requirements were too broad as one flat list

**Risk**: Implementers would have to mentally group lifecycle, embedding, code indexing, explanation, graph, health, eval, and safety requirements before planning.

**Fix applied**: Grouped functional requirements under lifecycle, embedding/vector, code indexing, explainability/provenance/graph, health/jobs/evals, and safety/migration while preserving FR IDs.

### F2: Destructive maintenance security was implicit

**Risk**: Reset/rebuild and job cancellation can mutate or delete derived state. The spec required dry-run/report modes but did not explicitly require authorization, audit events, or secret redaction.

**Fix applied**: Added FR-040 and FR-041 for workspace/project scope, actor authorization, persisted audit events, and secret-safe output.

### F3: Migration safety was underspecified

**Risk**: Embedding ledgers, vector metadata, job events, and audit events imply persisted schema changes. Without migration constraints, implementation could require manual SQL or break existing workspaces.

**Fix applied**: Added FR-042 requiring idempotent, workspace-scoped, backward-compatible, recoverable migrations.

### F4: Scope needed clearer phase boundary

**Risk**: The target 10/10 architecture is broad enough to create one oversized implementation pass. Graph quality and dashboard depth could block higher-value lifecycle repair.

**Fix applied**: Added FR-043 and an assumption that P1 must restore operational trust first, while P2 can deepen graph quality, dashboards, and broader eval coverage.

## Residual Risks For Planning

- Plan must define exact JSON contracts for reset/rebuild reports, job status, health, explain output, and eval output.
- Plan must choose whether job status lives under memory commands, a generic jobs command group, or both.
- Plan must identify precise migration order so old recall/search commands continue working while new ledgers backfill.
- Plan must keep default evals deterministic and local; model-heavy or accelerator-heavy evals need explicit opt-in.
