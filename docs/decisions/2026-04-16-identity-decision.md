---
date: 2026-04-16
kind: adr
status: accepted
gate: 2
plan: docs/plans/2026-04-16-memory-v2b-plan.md
finding: product-review F2 (identity conflict — AGENTS.md control-plane-first vs spec memory-first)
---

# ADR — Gate 2: Identity (Memory-first vs Control-plane-first)

## Context

`AGENTS.md` declares Fulcrum as a control-plane-first system. The Memory Architecture v2 spec title and framing are memory-first. Document review surfaced this as a coherence break that has to resolve before v2b PRs touch identity-coupled surfaces (graph schema, A2A cards, role policy).

Two options:
- **Memory-first authority**: spec wins; rewrite AGENTS.md to lead with memory + safety; control-plane is a derived surface.
- **Title-wins-authority**: AGENTS.md wins; the v2 spec's memory-first framing is acknowledged as a layer atop the control-plane identity, not a re-identification of the system.

## Decision

**Title-wins-authority.** Keep AGENTS.md control-plane-first as the authoritative system identity. The v2 spec's memory-first framing remains as a sub-domain narrative inside that identity.

Phase ordering (per v2b plan §"Open questions" #1 with title-wins):
1. v2b Phase 1 (PRs 10–12): Kuzu unification + global scope as control-plane unification deliverables (memory is one of many entity types in the unified graph).
2. v2b Phase 2 (PRs 13–15): Cross-entity context + procedural-memory + Fulcrum-specific eval — explicitly framed as control-plane consumers, with memory as the substrate.
3. v2b Phase 3 (PRs 16–18): Per-host plugin standardization + monitor Graph tab — control-plane operator surfaces.
4. v2b Phase 4 (PRs 19–21): A2A + LongMemEval reframe + flag removal — final cleanup.

AGENTS.md is updated only minimally: add a note that memory v2 is a sub-domain initiative inside the control-plane, not a re-architecture.

## Consequences

- v2b PR 10's commit messages and PR descriptions frame the Kuzu unification as a control-plane consolidation that happens to subsume memory (rather than as a memory-graph rollup).
- A2A card derivation (v2b PR 19) treats agent identity as the primary entity; memory is a related surface.
- No re-naming of packages or top-level docs.

## Override path

The user can pre-write a competing ADR before resuming, choosing memory-first. The executor reads `docs/decisions/2026-04-16-identity-decision.md` and honors whichever decision is on disk; it does not re-litigate.
